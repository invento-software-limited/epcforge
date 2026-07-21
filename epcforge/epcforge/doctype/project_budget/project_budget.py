# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ProjectBudget(Document):
	def before_save(self):
		self.calculate_totals()

	def calculate_totals(self):
		"""Calculate totals from budget items"""
		total_budget = 0
		total_committed = 0
		total_actual = 0

		for item in self.budget_items:
			total_budget += item.budget_amount or 0
			total_committed += item.committed_amount or 0
			total_actual += item.actual_amount or 0
			item.remaining_balance = (
				(item.budget_amount or 0) - (item.committed_amount or 0) - (item.actual_amount or 0)
			)

		self.approved_budget = total_budget
		self.committed_amount = total_committed
		self.actual_cost = total_actual

		if total_budget > 0:
			self.percent_used = ((total_committed + total_actual) / total_budget) * 100
		else:
			self.percent_used = 0

		self.remaining_budget = total_budget - total_committed - total_actual
		self.cost_variance = (self.contract_value or 0) - total_actual - total_committed


@frappe.whitelist()
def get_budget_summary(budget_name):
	"""Return summary data for the budget dashboard"""
	budget = frappe.get_doc("Project Budget", budget_name)
	return {
		"contract_value": budget.contract_value,
		"approved_budget": budget.approved_budget,
		"committed_amount": budget.committed_amount,
		"actual_cost": budget.actual_cost,
		"percent_used": budget.percent_used,
		"remaining_budget": budget.remaining_budget,
		"cost_variance": budget.cost_variance,
		"item_count": len(budget.budget_items),
	}
