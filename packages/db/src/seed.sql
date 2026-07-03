-- Dev seed data. Idempotent.
INSERT INTO organization (id, name, slug, created_at)
VALUES ('org_dev', 'dev', 'dev', now())
ON CONFLICT DO NOTHING;

INSERT INTO networks (id, organization_id, name, cidr, mtu)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'org_dev',
  'default',
  '10.7.0.0/24',
  1280
)
ON CONFLICT DO NOTHING;
