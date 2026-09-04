-- Retired (GROUP_CDF-era) email templates are archived rather than
-- deleted, and hidden from Admin's normal template list.
ALTER TABLE "EmailTemplate" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
