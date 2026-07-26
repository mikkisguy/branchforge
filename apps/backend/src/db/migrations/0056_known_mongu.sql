ALTER TABLE "characters"
  ADD CONSTRAINT "characters_name_type_check"
  CHECK ("characters"."name_type" IN (
    'literal', 'variable', 'interpolated', 'tagged', 'none', 'empty',
    'unknown'
  )) NOT VALID;

ALTER TABLE "characters"
  VALIDATE CONSTRAINT "characters_name_type_check";