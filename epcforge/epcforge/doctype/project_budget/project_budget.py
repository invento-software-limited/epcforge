# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate
from frappe.utils import today as frappe_today


class ProjectBudget(Document):
	def autoname(self):
		from frappe.model.naming import _format_autoname

		fmt = (
			frappe.db.get_single_value("EPCForge Settings", "budget_naming_series") or "BUD-{project}-{####}"
		)
		self.name = _format_autoname(f"format:{fmt}", self)

	def before_insert(self):
		from epcforge.epcforge.doctype.epcforge_settings.epcforge_settings import EPCForgeSettings

		get = EPCForgeSettings.get_default
		if not self.epc_role:
			self.epc_role = get("default_role")
		if not self.epc_discipline:
			self.epc_discipline = get("default_discipline")
		if not self.project:
			self.project = get("default_project")

	def before_save(self):
		self.recalculate_budget()

	def recalculate_budget(self):
		self.refresh_contract_value()

		total_budget = 0.0
		total_committed = 0.0
		total_actual = 0.0

		for item in self.budget_items:
			item.committed_amount = self._committed_for_cost_head(item.cost_head)
			item.actual_amount = self._actual_for_cost_head(item.cost_head)

			item.percent_used = (
				round((item.actual_amount / item.budget_amount) * 100.0, 2) if item.budget_amount else 0.0
			)
			item.remaining_balance = (item.budget_amount or 0) - item.committed_amount - item.actual_amount

			if not item.actual_amount:
				item.status = "Not Started"
			elif item.actual_amount > item.budget_amount:
				item.status = "Over Budget"
			elif item.percent_used > 85.0:
				item.status = "On Track"
			else:
				item.status = "Under Budget"

			total_budget += item.budget_amount or 0
			total_committed += item.committed_amount
			total_actual += item.actual_amount

		self.approved_budget = total_budget
		self.committed_amount = total_committed
		self.actual_cost = total_actual
		self.percent_used = round((total_actual / total_budget) * 100.0, 2) if total_budget else 0.0
		self.remaining_budget = total_budget - total_committed - total_actual
		self.cost_variance = (self.contract_value or 0) - total_actual - total_committed

		self.calculate_evm(total_budget, total_actual)

	def refresh_contract_value(self):
		boq_amount = frappe.db.get_value(
			"BOQ", {"project": self.project, "status": "Approved"}, "total_amount"
		)
		if not boq_amount:
			boq_amount = (
				frappe.db.get_value("BOQ", {"project": self.project, "docstatus": ["<", 2]}, "total_amount")
				or 0.0
			)
		self.contract_value = boq_amount
		if not self.boq:
			self.boq = frappe.db.get_value("BOQ", {"project": self.project, "docstatus": ["<", 2]}, "name")

	def _committed_for_cost_head(self, cost_head):
		return (
			frappe.db.sql(
				"""
				select coalesce(sum(grand_total), 0) from `tabPurchase Order`
				where project = %s and epc_cost_head = %s and docstatus = 1
				""",
				(self.project, cost_head),
			)[0][0]
			or 0.0
		)

	def _actual_for_cost_head(self, cost_head):
		pi_total = (
			frappe.db.sql(
				"""
				select coalesce(sum(grand_total), 0) from `tabPurchase Invoice`
				where project = %s and epc_cost_head = %s and docstatus = 1
				""",
				(self.project, cost_head),
			)[0][0]
			or 0.0
		)
		ts_total = (
			frappe.db.sql(
				"""
				select coalesce(sum(tsd.costing_amount), 0) from `tabTimesheet Detail` tsd
				join `tabTimesheet` ts on tsd.parent = ts.name
				where tsd.project = %s and tsd.epc_cost_head = %s and ts.status = 'Approved'
				""",
				(self.project, cost_head),
			)[0][0]
			or 0.0
		)
		return flt(pi_total) + flt(ts_total)

	def calculate_evm(self, approved_budget, actual_cost):
		"""Cost Performance Index, Schedule Performance Index, EAC, health & schedule status.
		Skipped entirely when manual_evm_override is checked.
		"""
		project_doc = frappe.db.get_value(
			"Project",
			self.project,
			["percent_complete", "expected_start_date", "expected_end_date", "status"],
			as_dict=True,
		)
		if not project_doc:
			return

		project_progress = flt(project_doc.percent_complete)
		earned_value = flt(approved_budget) * (project_progress / 100.0)

		if not self.manual_evm_override:
			self.cpi = round(earned_value / actual_cost, 2) if actual_cost > 0 else 1.0

		self.eac = round(flt(approved_budget) / self.cpi, 2) if self.cpi else flt(approved_budget)

		if not self.manual_evm_override:
			start, end = project_doc.expected_start_date, project_doc.expected_end_date
			today_date = getdate(frappe_today())

			if start and end and end > start:
				total_days = (end - start).days
				elapsed_days = max(0, (today_date - start).days)
				planned_pct = min(elapsed_days / total_days, 1.0) * 100.0
			else:
				planned_pct = project_progress

			planned_value = flt(approved_budget) * (planned_pct / 100.0)
			self.epc_spi = round(earned_value / planned_value, 2) if planned_value > 0 else 1.0

			if project_doc.status == "Completed":
				self.epc_sched_status = "Completed"
			elif self.epc_spi >= 1.0:
				self.epc_sched_status = "On Track"
			elif self.epc_spi >= 0.85:
				self.epc_sched_status = "Delayed"
			else:
				self.epc_sched_status = "Severely Delayed"

			if self.cpi >= 1.0 and self.epc_spi >= 0.9:
				self.epc_health = "Green"
			elif self.cpi >= 0.85 and self.epc_spi >= 0.75:
				self.epc_health = "Yellow"
			else:
				self.epc_health = "Red"


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
		"cpi": budget.cpi,
		"epc_spi": budget.epc_spi,
		"eac": budget.eac,
		"epc_health": budget.epc_health,
		"epc_sched_status": budget.epc_sched_status,
		"item_count": len(budget.budget_items),
	}
