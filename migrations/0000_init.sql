CREATE TABLE `meals` (
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`recipe_url` text,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`date`, `slot`),
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meals_slot_check" CHECK("meals"."slot" in ('lunch', 'dinner'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
