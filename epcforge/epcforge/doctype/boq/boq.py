# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class BOQ(Document):
	def before_save(self):
		self.calculate_item_amounts()
		self.calculate_totals()

	def before_submit(self):
		if self.status != "Draft":
			frappe.throw(_("Only Draft BOQ can be submitted"))
		self.status = "Submitted"
		self.revision = (self.revision or 0) + 1

	def before_cancel(self):
		self.status = "Cancelled"

	def on_submit(self):
		self.create_project_budget_if_not_exists()

	def calculate_item_amounts(self):
		"""Calculate amount = qty * rate for each BOQ item"""
		for item in self.boq_items:
			item.amount = (item.qty or 0) * (item.rate or 0)

	def calculate_totals(self):
		"""Calculate total amount, estimated cost, and margin"""
		total_amount = 0
		total_estimated = 0

		for item in self.boq_items:
			total_amount += item.amount or 0
			total_estimated += item.estimated_cost or 0

			if item.amount and item.estimated_cost:
				item.margin_pct = ((item.amount - item.estimated_cost) / item.amount) * 100

		self.total_amount = total_amount
		self.estimated_cost = total_estimated

		if total_amount > 0:
			self.gross_margin_pct = ((total_amount - total_estimated) / total_amount) * 100
			self.budget_variance = total_amount - total_estimated
		else:
			self.gross_margin_pct = 0
			self.budget_variance = 0

	def create_project_budget_if_not_exists(self):
		"""Auto-create a Project Budget when BOQ is submitted"""
		if not frappe.db.exists("Project Budget", {"project": self.project}):
			budget = frappe.new_doc("Project Budget")
			budget.project = self.project
			budget.project_name = self.project_name
			budget.boq = self.name
			budget.contract_value = self.total_amount
			budget.approved_budget = self.estimated_cost
			budget.insert()


@frappe.whitelist()
def get_boq_summary(boq_name):
	"""Return summary data for the BOQ dashboard"""
	boq = frappe.get_doc("BOQ", boq_name)
	return {
		"total_amount": boq.total_amount,
		"estimated_cost": boq.estimated_cost,
		"actual_cost": boq.actual_cost,
		"budget_variance": boq.budget_variance,
		"gross_margin_pct": boq.gross_margin_pct,
		"item_count": len(boq.boq_items),
		"status": boq.status,
		"revision": boq.revision,
	}


@frappe.whitelist()
def get_boq_items_by_group(boq_name):
	"""Return BOQ items grouped for tree display"""
	boq = frappe.get_doc("BOQ", boq_name)
	items = []
	for item in boq.boq_items:
		items.append(
			{
				"boq_code": item.boq_code,
				"description": item.description,
				"group": item.group,
				"qty": item.qty,
				"uom": item.uom,
				"rate": item.rate,
				"amount": item.amount,
				"estimated_cost": item.estimated_cost,
				"item_type": item.item_type,
				"phase": item.phase,
			}
		)
	return items
