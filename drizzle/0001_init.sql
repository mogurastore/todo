CREATE TABLE IF NOT EXISTS `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS `identities` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_user_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS `identities_provider_provider_user_id_unique` ON `identities` (`provider`,`provider_user_id`);
CREATE TABLE IF NOT EXISTS `lists` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `title` text NOT NULL DEFAULT 'Inbox',
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS `todos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `list_id` integer NOT NULL REFERENCES `lists`(`id`),
  `title` text NOT NULL,
  `done` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
