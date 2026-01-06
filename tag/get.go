package tag

import (
	"context"

	"github.com/jinzhu/copier"
	"github.com/traggo/server/auth"
	"github.com/traggo/server/generated/gqlmodel"
	"github.com/traggo/server/model"
)

// Tags returns all tags.
func (r *ResolverForTag) Tags(ctx context.Context) ([]*gqlmodel.TagDefinition, error) {
	var tags []model.TagDefinition
	userID := auth.GetUser(ctx).ID

	find := r.DB.
		Select("tag_definitions.*, COALESCE(strftime('%s', user_recent_tags.last_used_at), '0') as usages").
		Joins("LEFT JOIN user_recent_tags ON tag_definitions.key = user_recent_tags.tag_key AND user_recent_tags.user_id = ?", userID).
		Where("tag_definitions.user_id = ?", userID).
		Order("usages desc").
		Find(&tags)
	result := []*gqlmodel.TagDefinition{}
	copier.Copy(&result, &tags)
	return result, find.Error
}
