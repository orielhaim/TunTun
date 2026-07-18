import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);
const rows = await sql.unsafe(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conname = 'devices_type_check'
`);
console.log(JSON.stringify(rows, null, 2));
await sql.end();
