-- Publish explicit per-group camera script launch; existing checks and tokens are retained.
begin;
insert into pi_helper.tool_releases(version,bootstrap_sha256,files) values ('1.3.0','f72ae8edbb7d9c1ac1373f3de80d92e82a81cd6f4c2e54ecf711ae42e5fef570','{"device":"8d7c9e27aeff174f269d5c8ce88ad9f79e2dd92c92c29daeb9da5551d44c6d81","course":"4d5c8b1d995e90ffa1d64b16c01c98aa37d61585200aff944d29137649c803e1","camera":"e53b91296f3b30883de35fa6b9486b1e83a752b69b2fd044359a40312749dd42"}'::jsonb) on conflict(version) do nothing;
notify pgrst,'reload schema';
commit;
