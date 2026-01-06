package timespan

import (
	"time"

	"github.com/jinzhu/gorm"
	"github.com/traggo/server/model"
)

// updateRecentTags updates the user_recent_tags table with the most recent usage time for each tag
func updateRecentTags(db *gorm.DB, userID int, tags []model.TimeSpanTag, timestamp time.Time) {
	for _, tag := range tags {
		// UPSERT: Insert or update the last_used_at timestamp
		// This works across SQLite, MySQL, and PostgreSQL with different syntax
		dialect := db.Dialect().GetName()

		if dialect == "sqlite3" {
			// SQLite uses INSERT OR REPLACE
			db.Exec(`INSERT OR REPLACE INTO user_recent_tags (user_id, tag_key, last_used_at) VALUES (?, ?, ?)`,
				userID, tag.Key, timestamp)
		} else if dialect == "mysql" {
			// MySQL uses INSERT ... ON DUPLICATE KEY UPDATE
			db.Exec(`INSERT INTO user_recent_tags (user_id, tag_key, last_used_at) VALUES (?, ?, ?)
				ON DUPLICATE KEY UPDATE last_used_at = ?`,
				userID, tag.Key, timestamp, timestamp)
		} else {
			// PostgreSQL uses INSERT ... ON CONFLICT DO UPDATE
			db.Exec(`INSERT INTO user_recent_tags (user_id, tag_key, last_used_at) VALUES (?, ?, ?)
				ON CONFLICT (user_id, tag_key) DO UPDATE SET last_used_at = ?`,
				userID, tag.Key, timestamp, timestamp)
		}
	}
}
