CREATE TABLE `job_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`bought_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_parts_job_id_idx` ON `job_parts` (`job_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `due_on` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `repeat_every` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `repeat_unit` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `next_job_id` integer REFERENCES jobs(id) ON DELETE SET NULL;