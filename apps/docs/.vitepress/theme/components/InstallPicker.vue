<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type Platform = "linux" | "macos" | "windows";

const { compact = false } = defineProps<{
  compact?: boolean;
}>();

const platforms: {
  id: Platform;
  label: string;
  hint: string;
}[] = [
  { id: "linux", label: "Linux", hint: "Servers, VMs, workstations" },
  { id: "macos", label: "macOS", hint: "Apple Silicon" },
  { id: "windows", label: "Windows", hint: "PowerShell as Administrator" },
];

const selected = ref<Platform>("linux");
const copied = ref(false);

const commands: Record<Platform, string> = {
  linux:
    "curl -fsSL https://github.com/tunnetio/Tunnet/releases/latest/download/install.sh | sh",
  macos:
    "curl -fsSL https://github.com/tunnetio/Tunnet/releases/latest/download/install.sh | sh",
  windows:
    "irm https://github.com/tunnetio/Tunnet/releases/latest/download/install.ps1 | iex",
};

const shellLabel = computed(() =>
  selected.value === "windows" ? "PowerShell" : "Terminal",
);

const command = computed(() => commands[selected.value]);

const afterNote = computed(() => {
  switch (selected.value) {
    case "linux":
      return "Then enroll and start the service. Needs root for the TUN interface.";
    case "macos":
      return "Then enroll and start the service. Needs admin for the TUN interface.";
    case "windows":
      return "Then enroll and start the service. Run PowerShell as Administrator.";
  }
});

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  if (ua.includes("win") || platform.includes("win")) return "windows";
  if (ua.includes("mac") || platform.includes("mac")) return "macos";
  return "linux";
}

onMounted(() => {
  selected.value = detectPlatform();
});

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command.value);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <section
    class="install-picker"
    :class="{ 'is-compact': compact }"
    aria-label="Install Tunnet"
  >
    <header class="install-picker__header">
      <h2 class="install-picker__title">One command. Your machine joins the mesh</h2>
      <p class="install-picker__lede">
        Pick your OS - Copy, paste, done.
      </p>
    </header>

    <div class="install-picker__tabs" role="tablist" aria-label="Operating system">
      <button
        v-for="p in platforms"
        :key="p.id"
        type="button"
        role="tab"
        class="install-picker__tab"
        :class="{ 'is-active': selected === p.id }"
        :aria-selected="selected === p.id"
        @click="selected = p.id"
      >
        <span class="install-picker__tab-icon" aria-hidden="true">
          <svg v-if="p.id === 'linux'" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3c-1.4 1.6-2.2 3.4-2.2 5.2 0 .9.2 1.7.5 2.4-.9.5-1.8 1.5-1.8 3.1 0 1.4.8 2.5 2 3.1-.1.4-.2.8-.2 1.2 0 1.8 1.5 2.5 3.7 2.5s3.7-.7 3.7-2.5c0-.4-.1-.8-.2-1.2 1.2-.6 2-1.7 2-3.1 0-1.6-.9-2.6-1.8-3.1.3-.7.5-1.5.5-2.4C18.2 6.4 17.4 4.6 16 3c-.6.9-1.4 1.5-2.3 1.8C12.9 4.5 12.4 3.8 12 3z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else-if="p.id === 'macos'" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16.7 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1 1-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.7-3.2zM14.4 5.6c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3z"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 5.5 10.2 4.4v7.1H3V5.5zm0 13 7.2 1.1v-7.2H3v6.1zM11.1 4.3 21 2.8v8.7h-9.9V4.3zm0 16.9L21 21.2v-8.8h-9.9v8.8z"
            />
          </svg>
        </span>
        <span class="install-picker__tab-text">
          <span class="install-picker__tab-label">{{ p.label }}</span>
          <span class="install-picker__tab-hint">{{ p.hint }}</span>
        </span>
      </button>
    </div>

    <div class="install-picker__panel" role="tabpanel">
      <div class="install-picker__meta">
        <span class="install-picker__shell">{{ shellLabel }}</span>
        <button
          type="button"
          class="install-picker__copy"
          :aria-label="copied ? 'Copied' : 'Copy install command'"
          @click="copyCommand"
        >
          {{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
      <pre class="install-picker__command"><code>{{ command }}</code></pre>
      <p class="install-picker__note">{{ afterNote }}</p>
    </div>

    <p v-if="!compact" class="install-picker__footer">
      Prefer the details?
      <a href="/guide/installation">Full installation guide</a>
      · update later with
      <code>tunnet update</code>
    </p>
    <p v-else class="install-picker__footer">
      Update later with <code>tunnet update</code>
    </p>
  </section>
</template>

<style scoped>
.install-picker {
  --ip-ink: var(--vp-c-text-1);
  --ip-muted: var(--vp-c-text-2);
  --ip-faint: var(--vp-c-text-3);
  --ip-surface: var(--vp-c-bg-soft);
  --ip-border: var(--vp-c-divider);
  --ip-accent: #0f7a6b;
  --ip-accent-soft: color-mix(in oklab, #0f7a6b 14%, transparent);
  --ip-accent-strong: #0b5f54;
  --ip-code-bg: color-mix(in oklab, var(--vp-c-bg-alt) 88%, #0f7a6b 12%);
  max-width: 920px;
  margin: 2rem auto 0rem;
  padding: 0 1.5rem;
}

.install-picker.is-compact {
  max-width: none;
  margin: 1.25rem 0 2rem;
  padding: 0;
}

:global(.dark) .install-picker {
  --ip-accent: #3dbaa8;
  --ip-accent-soft: color-mix(in oklab, #3dbaa8 18%, transparent);
  --ip-accent-strong: #7dd8ca;
  --ip-code-bg: color-mix(in oklab, var(--vp-c-bg-alt) 82%, #0f7a6b 18%);
}

.install-picker__header {
  text-align: center;
  margin-bottom: 1.75rem;
}

.install-picker.is-compact .install-picker__header {
  text-align: left;
  margin-bottom: 1.15rem;
}

.install-picker__eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ip-accent);
}

.install-picker__title {
  margin: 0 0 0.65rem;
  font-size: clamp(1.45rem, 2.4vw, 1.85rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: var(--ip-ink);
}

.install-picker.is-compact .install-picker__title {
  font-size: 1.35rem;
}

.install-picker__lede {
  margin: 0 auto;
  max-width: 34rem;
  font-size: 1rem;
  line-height: 1.55;
  color: var(--ip-muted);
}

.install-picker.is-compact .install-picker__lede {
  margin: 0;
  max-width: none;
}

.install-picker__tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}

.install-picker__tab {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--ip-border);
  border-radius: 14px;
  background: var(--ip-surface);
  color: var(--ip-ink);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.install-picker__tab:hover {
  border-color: color-mix(in oklab, var(--ip-accent) 45%, var(--ip-border));
  transform: translateY(-1px);
}

.install-picker__tab.is-active {
  border-color: var(--ip-accent);
  background: var(--ip-accent-soft);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--ip-accent) 35%, transparent);
}

.install-picker__tab-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 9px;
  background: color-mix(in oklab, var(--vp-c-bg) 70%, transparent);
  color: var(--ip-accent-strong);
}

.install-picker__tab-icon svg {
  width: 1.15rem;
  height: 1.15rem;
}

.install-picker__tab-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.install-picker__tab-label {
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.install-picker__tab-hint {
  font-size: 0.72rem;
  color: var(--ip-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.install-picker__panel {
  border: 1px solid var(--ip-border);
  border-radius: 16px;
  background: var(--ip-surface);
  padding: 0.85rem 1rem 1rem;
  overflow: hidden;
}

.install-picker__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
}

.install-picker__shell {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ip-faint);
}

.install-picker__copy {
  border: 1px solid var(--ip-border);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--ip-ink);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.28rem 0.75rem;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.install-picker__copy:hover {
  border-color: var(--ip-accent);
  color: var(--ip-accent-strong);
}

.install-picker__command {
  margin: 0;
  padding: 0.95rem 1rem;
  border-radius: 12px;
  background: var(--ip-code-bg);
  overflow-x: auto;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--ip-ink);
}

.install-picker__command code {
  font-family: var(--vp-font-family-mono);
  white-space: pre;
}

.install-picker__note {
  margin: 0.75rem 0 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--ip-muted);
}

.install-picker__footer {
  margin: 1rem 0 0;
  text-align: center;
  font-size: 0.88rem;
  color: var(--ip-muted);
}

.install-picker.is-compact .install-picker__footer {
  text-align: left;
}

.install-picker__footer a {
  color: var(--ip-accent-strong);
  font-weight: 600;
  text-decoration: none;
}

.install-picker__footer a:hover {
  text-decoration: underline;
}

.install-picker__footer code {
  font-size: 0.84em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
}

@media (max-width: 720px) {
  .install-picker {
    margin-top: 2.5rem;
    padding: 0 1rem;
  }

  .install-picker.is-compact {
    margin-top: 1rem;
    padding: 0;
  }

  .install-picker__tabs {
    grid-template-columns: 1fr;
  }

  .install-picker__tab-hint {
    white-space: normal;
  }

  .install-picker__command {
    font-size: 0.78rem;
  }
}
</style>
