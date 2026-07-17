//! SFTP subsystem: filesystem access scoped to the target SSH user.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions, ReadDir};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
#[cfg(unix)]
use std::sync::Mutex as StdMutex;

use anyhow::Context;
#[cfg(unix)]
use anyhow::bail;
use russh_sftp::protocol::{
    Attrs, Data, File as SftpFile, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode,
    Version,
};
use russh_sftp::server::Handler;

use super::user::{self, UserInfo};

#[cfg(unix)]
static PRIV_LOCK: StdMutex<()> = StdMutex::new(());

pub struct SftpSession {
    user: UserInfo,
    next_handle: u64,
    files: HashMap<String, File>,
    dirs: HashMap<String, DirState>,
}

struct DirState {
    path: PathBuf,
    iter: Option<ReadDir>,
    sent_dot: bool,
}

impl SftpSession {
    pub fn new(target_user: &str) -> anyhow::Result<Self> {
        let user = user::lookup(target_user).context("sftp user lookup")?;
        #[cfg(unix)]
        {
            let euid = unsafe { libc::geteuid() };
            if euid != 0 && euid != user.uid {
                bail!(
                    "cannot run SFTP as `{}` (agent uid {euid}, target uid {})",
                    user.username,
                    user.uid
                );
            }
        }
        Ok(Self {
            user,
            next_handle: 1,
            files: HashMap::new(),
            dirs: HashMap::new(),
        })
    }

    fn alloc_handle(&mut self, prefix: &str) -> String {
        let id = self.next_handle;
        self.next_handle = self.next_handle.wrapping_add(1).max(1);
        format!("{prefix}{id}")
    }

    fn resolve_path(&self, path: &str) -> PathBuf {
        let path = path.trim();
        if path.is_empty() || path == "." || path == "./" || path == "~" {
            return self.user.home_dir.clone();
        }
        if let Some(rest) = path.strip_prefix("~/") {
            return self.user.home_dir.join(rest);
        }
        let p = PathBuf::from(path);
        if p.is_absolute() {
            p
        } else {
            self.user.home_dir.join(p)
        }
    }

    fn ok(id: u32) -> Status {
        Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".into(),
            language_tag: "en-US".into(),
        }
    }

    fn map_io(err: io::Error) -> StatusCode {
        match err.kind() {
            io::ErrorKind::NotFound => StatusCode::NoSuchFile,
            io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
            io::ErrorKind::AlreadyExists => StatusCode::Failure,
            io::ErrorKind::UnexpectedEof => StatusCode::Eof,
            _ => StatusCode::Failure,
        }
    }

    fn with_creds<T>(&self, f: impl FnOnce() -> io::Result<T>) -> Result<T, StatusCode> {
        #[cfg(unix)]
        {
            as_user(&self.user, f)
        }
        #[cfg(not(unix))]
        {
            f().map_err(Self::map_io)
        }
    }

    fn metadata_attrs(meta: &fs::Metadata) -> FileAttributes {
        FileAttributes::from(meta)
    }

    fn apply_attrs(path: &Path, attrs: &FileAttributes) -> io::Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::{PermissionsExt, chown};
            if let Some(mode) = attrs.permissions {
                let mut perms = fs::metadata(path)?.permissions();
                perms.set_mode(mode & 0o7777);
                fs::set_permissions(path, perms)?;
            }
            if attrs.uid.is_some() || attrs.gid.is_some() {
                let meta = fs::metadata(path)?;
                let uid = attrs.uid.unwrap_or_else(|| {
                    use std::os::unix::fs::MetadataExt;
                    meta.uid()
                });
                let gid = attrs.gid.unwrap_or_else(|| {
                    use std::os::unix::fs::MetadataExt;
                    meta.gid()
                });
                chown(path, Some(uid), Some(gid))?;
            }
        }
        #[cfg(windows)]
        {
            let _ = (path, attrs);
            if let Some(mode) = attrs.permissions {
                let mut perms = fs::metadata(path)?.permissions();
                perms.set_readonly(mode & 0o222 == 0);
                fs::set_permissions(path, perms)?;
            }
        }
        let _ = attrs;
        Ok(())
    }

    fn open_options(flags: OpenFlags) -> OpenOptions {
        let mut opts = OpenOptions::new();
        if flags.contains(OpenFlags::READ) {
            opts.read(true);
        }
        if flags.contains(OpenFlags::WRITE) || flags.contains(OpenFlags::APPEND) {
            opts.write(true);
        }
        if flags.contains(OpenFlags::APPEND) {
            opts.append(true);
        }
        if flags.contains(OpenFlags::CREATE) {
            if flags.contains(OpenFlags::EXCLUDE) {
                opts.create_new(true);
            } else {
                opts.create(true);
            }
        }
        if flags.contains(OpenFlags::TRUNCATE) {
            opts.truncate(true);
        }
        // Opening with neither read nor write is invalid for std; default to read.
        if !flags.contains(OpenFlags::READ)
            && !flags.contains(OpenFlags::WRITE)
            && !flags.contains(OpenFlags::APPEND)
        {
            opts.read(true);
        }
        opts
    }
}

#[cfg(unix)]
fn as_user<T>(user: &UserInfo, f: impl FnOnce() -> io::Result<T>) -> Result<T, StatusCode> {
    let _guard = PRIV_LOCK.lock().map_err(|_| StatusCode::Failure)?;

    let euid = unsafe { libc::geteuid() };
    let egid = unsafe { libc::getegid() };

    if euid == user.uid {
        return f().map_err(SftpSession::map_io);
    }
    if euid != 0 {
        return Err(StatusCode::PermissionDenied);
    }

    let switched = unsafe { libc::setegid(user.gid) == 0 && libc::seteuid(user.uid) == 0 };
    if !switched {
        unsafe {
            let _ = libc::seteuid(euid);
            let _ = libc::setegid(egid);
        }
        return Err(StatusCode::PermissionDenied);
    }

    let result = f();

    unsafe {
        let _ = libc::seteuid(euid);
        let _ = libc::setegid(egid);
    }

    result.map_err(SftpSession::map_io)
}

impl Handler for SftpSession {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(
        &mut self,
        _version: u32,
        _extensions: HashMap<String, String>,
    ) -> Result<Version, Self::Error> {
        Ok(Version::new())
    }

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        attrs: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        let path = self.resolve_path(&filename);
        let created = pflags.contains(OpenFlags::CREATE);
        let file = self.with_creds(|| Self::open_options(pflags).open(&path))?;

        if created {
            let _ = self.with_creds(|| Self::apply_attrs(&path, &attrs));
        }

        let handle = self.alloc_handle("f");
        self.files.insert(handle.clone(), file);
        Ok(Handle { id, handle })
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        self.files.remove(&handle);
        self.dirs.remove(&handle);
        Ok(Self::ok(id))
    }

    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let file = self.files.get_mut(&handle).ok_or(StatusCode::Failure)?;
        let mut buf = vec![0u8; len as usize];
        let n = (|| -> io::Result<usize> {
            file.seek(SeekFrom::Start(offset))?;
            file.read(&mut buf)
        })()
        .map_err(Self::map_io)?;
        if n == 0 {
            return Err(StatusCode::Eof);
        }
        buf.truncate(n);
        Ok(Data { id, data: buf })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        let file = self.files.get_mut(&handle).ok_or(StatusCode::Failure)?;
        (|| -> io::Result<()> {
            file.seek(SeekFrom::Start(offset))?;
            file.write_all(&data)?;
            Ok(())
        })()
        .map_err(Self::map_io)?;
        Ok(Self::ok(id))
    }

    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let path = self.resolve_path(&path);
        let meta = self.with_creds(|| fs::symlink_metadata(&path))?;
        Ok(Attrs {
            id,
            attrs: Self::metadata_attrs(&meta),
        })
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        let file = self.files.get(&handle).ok_or(StatusCode::Failure)?;
        let meta = file.metadata().map_err(Self::map_io)?;
        Ok(Attrs {
            id,
            attrs: Self::metadata_attrs(&meta),
        })
    }

    async fn setstat(
        &mut self,
        id: u32,
        path: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        let path = self.resolve_path(&path);
        self.with_creds(|| Self::apply_attrs(&path, &attrs))?;
        Ok(Self::ok(id))
    }

    async fn fsetstat(
        &mut self,
        id: u32,
        handle: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        let file = self.files.get(&handle).ok_or(StatusCode::Failure)?;
        if let Some(mode) = attrs.permissions {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = file.metadata().map_err(Self::map_io)?.permissions();
                perms.set_mode(mode & 0o7777);
                file.set_permissions(perms).map_err(Self::map_io)?;
            }
            #[cfg(windows)]
            {
                let mut perms = file.metadata().map_err(Self::map_io)?.permissions();
                perms.set_readonly(mode & 0o222 == 0);
                file.set_permissions(perms).map_err(Self::map_io)?;
            }
        }
        Ok(Self::ok(id))
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        let path = self.resolve_path(&path);
        let iter = self.with_creds(|| fs::read_dir(&path))?;
        let handle = self.alloc_handle("d");
        self.dirs.insert(
            handle.clone(),
            DirState {
                path,
                iter: Some(iter),
                sent_dot: false,
            },
        );
        Ok(Handle { id, handle })
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        let dir = self.dirs.get_mut(&handle).ok_or(StatusCode::Failure)?;
        let mut files = Vec::new();

        if !dir.sent_dot {
            dir.sent_dot = true;
            if let Ok(meta) = fs::symlink_metadata(&dir.path) {
                let mut attrs = Self::metadata_attrs(&meta);
                attrs.user = Some(self.user.username.clone());
                files.push(SftpFile::new(".", attrs.clone()));
                files.push(SftpFile::new("..", attrs));
            }
            // Prefer returning . / .. first; remaining entries on subsequent reads.
            if !files.is_empty() {
                return Ok(Name { id, files });
            }
        }

        let iter = dir.iter.as_mut().ok_or(StatusCode::Eof)?;
        const BATCH: usize = 64;
        for _ in 0..BATCH {
            match iter.next() {
                None => {
                    dir.iter = None;
                    break;
                }
                Some(Err(_)) => continue,
                Some(Ok(entry)) => {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if name == "." || name == ".." {
                        continue;
                    }
                    let attrs = match entry.metadata() {
                        Ok(m) => {
                            let mut a = Self::metadata_attrs(&m);
                            a.user = Some(self.user.username.clone());
                            a
                        }
                        Err(_) => FileAttributes::default(),
                    };
                    files.push(SftpFile::new(name, attrs));
                }
            }
        }

        if files.is_empty() {
            Err(StatusCode::Eof)
        } else {
            Ok(Name { id, files })
        }
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        let path = self.resolve_path(&filename);
        self.with_creds(|| fs::remove_file(&path))?;
        Ok(Self::ok(id))
    }

    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        let path = self.resolve_path(&path);
        self.with_creds(|| {
            fs::create_dir(&path)?;
            Self::apply_attrs(&path, &attrs)?;
            Ok(())
        })?;
        Ok(Self::ok(id))
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        let path = self.resolve_path(&path);
        self.with_creds(|| fs::remove_dir(&path))?;
        Ok(Self::ok(id))
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let path = self.resolve_path(&path);
        let resolved = self.with_creds(|| {
            if path.exists() {
                fs::canonicalize(&path)
            } else if let Some(parent) = path.parent() {
                let parent = if parent.as_os_str().is_empty() {
                    Path::new(".")
                } else {
                    parent
                };
                let canon_parent =
                    fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
                let name = path.file_name().unwrap_or_default();
                Ok(canon_parent.join(name))
            } else {
                Ok(path.clone())
            }
        })?;
        let display = normalize_display(&resolved);
        Ok(Name {
            id,
            files: vec![SftpFile::dummy(display)],
        })
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let path = self.resolve_path(&path);
        let meta = self.with_creds(|| fs::metadata(&path))?;
        Ok(Attrs {
            id,
            attrs: Self::metadata_attrs(&meta),
        })
    }

    async fn rename(
        &mut self,
        id: u32,
        oldpath: String,
        newpath: String,
    ) -> Result<Status, Self::Error> {
        let oldpath = self.resolve_path(&oldpath);
        let newpath = self.resolve_path(&newpath);
        self.with_creds(|| fs::rename(&oldpath, &newpath))?;
        Ok(Self::ok(id))
    }

    async fn readlink(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let path = self.resolve_path(&path);
        let target = self.with_creds(|| fs::read_link(&path))?;
        Ok(Name {
            id,
            files: vec![SftpFile::dummy(normalize_display(&target))],
        })
    }

    async fn symlink(
        &mut self,
        id: u32,
        linkpath: String,
        targetpath: String,
    ) -> Result<Status, Self::Error> {
        let linkpath = self.resolve_path(&linkpath);
        // targetpath is stored as given (may be relative).
        let target = PathBuf::from(&targetpath);
        self.with_creds(|| {
            #[cfg(unix)]
            {
                std::os::unix::fs::symlink(&target, &linkpath)?;
            }
            #[cfg(windows)]
            {
                if target.is_dir() {
                    std::os::windows::fs::symlink_dir(&target, &linkpath)?;
                } else {
                    std::os::windows::fs::symlink_file(&target, &linkpath)
                        .or_else(|_| std::os::windows::fs::symlink_dir(&target, &linkpath))?;
                }
            }
            Ok(())
        })?;
        Ok(Self::ok(id))
    }
}

fn normalize_display(path: &Path) -> String {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    if out.as_os_str().is_empty() {
        ".".into()
    } else {
        out.to_string_lossy().into_owned()
    }
}
