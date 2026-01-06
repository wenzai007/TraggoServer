package model

import "time"

// UserRecentTag tracks the most recent usage of a tag by a user.
// This table is used to efficiently sort tags by most recently used.
type UserRecentTag struct {
	UserID     int `gorm:"primary_key;type:int REFERENCES users(id) ON DELETE CASCADE"`
	TagKey     string `gorm:"primary_key"`
	LastUsedAt time.Time `gorm:"index:idx_user_last_used"`
}
