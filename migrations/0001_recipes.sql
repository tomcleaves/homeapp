CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_url_unique` ON `recipes` (`url`);--> statement-breakpoint
ALTER TABLE `meals` ADD `recipe_id` integer REFERENCES recipes(id) ON DELETE SET NULL;--> statement-breakpoint
-- Backfill: every distinct link already on a meal becomes a library recipe.
INSERT INTO `recipes` (`url`, `created_by`, `created_at`)
SELECT `recipe_url`, MIN(`updated_by`), MIN(`updated_at`)
FROM `meals`
WHERE `recipe_url` IS NOT NULL AND `recipe_url` <> ''
GROUP BY `recipe_url`;--> statement-breakpoint
UPDATE `meals`
SET `recipe_id` = (SELECT `id` FROM `recipes` WHERE `recipes`.`url` = `meals`.`recipe_url`)
WHERE `recipe_url` IS NOT NULL AND `recipe_url` <> '';