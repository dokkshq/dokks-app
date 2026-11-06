/** One-pass ceilings for the docs engine. Larger repos are read in batches. */

export const PIPELINE_COST_CEILING_USD = 6;
export const DEFAULT_REPO_DAILY_CAP_USD = 6;
export const DEFAULT_GLOBAL_DAILY_CAP_USD = 25;
export const DEFAULT_FIRST_BUILD_CAP_USD = 8;

export const MAX_TREE_PATHS = 2_000;
export const MAX_SNAPSHOT_FILES = 400;
export const MAX_SNAPSHOT_CHARS = 1_000_000;
export const MAX_FILE_CHARS = 60_000;
export const MAX_COMPARE_FILES = 400;
export const MAX_PATCH_CHARS = 30_000;
export const MAX_UNDERSTANDING_BATCHES = 25;
export const GITHUB_REQUEST_TIMEOUT_MS = 20_000;

export const WRITER_SOURCE_CHARS = 48_000;
export const WRITER_FILE_CHARS = 24_000;
export const WRITER_SOURCE_PATHS = 20;
export const MAX_PLANNED_PAGES = 20;
export const WRITE_CONCURRENCY = 4;

export const FIRST_BUILD_DIGEST_CHARS = 200_000;
export const PUSH_DIGEST_CHARS = 48_000;

export const AGENT_MEMORY_NOTES = 24;
export const AGENT_READ_FILE_CHARS = 24_000;
export const AGENT_SEARCH_HITS = 40;
export const AGENT_STEP_TOKENS = 1_200;

export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 280;
export const MAX_SECTION_LENGTH = 80;
export const MAX_SLUG_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 100_000;
