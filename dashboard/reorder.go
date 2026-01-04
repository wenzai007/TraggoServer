package dashboard

import (
	"context"

	"github.com/traggo/server/auth"
	"github.com/traggo/server/model"
)

// ReorderDashboard moves a dashboard up or down in the list.
func (r *ResolverForDashboard) ReorderDashboard(ctx context.Context, id int, moveUp bool) (bool, error) {
	userID := auth.GetUser(ctx).ID

	// Get all user's dashboards ordered by current order
	var dashboards []model.Dashboard
	if err := r.DB.Where(&model.Dashboard{UserID: userID}).Order("`order` asc, id asc").Find(&dashboards).Error; err != nil {
		return false, err
	}

	// Find the index of the dashboard to move
	currentIndex := -1
	for i, d := range dashboards {
		if d.ID == id {
			currentIndex = i
			break
		}
	}

	if currentIndex == -1 {
		return false, nil // Dashboard not found
	}

	// Calculate new index
	newIndex := currentIndex
	if moveUp {
		newIndex = currentIndex - 1
	} else {
		newIndex = currentIndex + 1
	}

	// Check bounds
	if newIndex < 0 || newIndex >= len(dashboards) {
		return false, nil // Already at the edge
	}

	// Swap the two dashboards
	dashboards[currentIndex], dashboards[newIndex] = dashboards[newIndex], dashboards[currentIndex]

	// Update order values for all dashboards
	for i, dashboard := range dashboards {
		dashboard.Order = i
		if err := r.DB.Model(&model.Dashboard{}).Where("id = ?", dashboard.ID).Update("order", i).Error; err != nil {
			return false, err
		}
	}

	return true, nil
}
