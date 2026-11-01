begin;
set local lock_timeout='5s';
-- A launcher patch: fix PCManFM's repeated Execute prompt for the desktop
-- launcher by registering a system application (system revision 3). Existing
-- pairings, approval rules and classroom files are unchanged.
insert into pi_helper.tool_releases(version,system_revision,bootstrap_sha256,files) values ('1.5.1',3,'237f7c4e90662e8ee12d7346576d74047091b5c74b029b3ec04e732b1af49f11','{"device":"b53c4e04e72bdb55d448e733a0fbb440e6e71f79b2891737e5d53f93735c182d","course":"4d5c8b1d995e90ffa1d64b16c01c98aa37d61585200aff944d29137649c803e1","camera":"e53b91296f3b30883de35fa6b9486b1e83a752b69b2fd044359a40312749dd42","updater":"29002520501a1164bfb3d845d00d2f4beed7f493a6564b805a295aa35782909d"}'::jsonb) on conflict(version) do nothing;
notify pgrst,'reload schema';
commit;
