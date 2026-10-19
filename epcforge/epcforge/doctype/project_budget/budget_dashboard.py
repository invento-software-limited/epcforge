# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

"""Data for the Dashboard tab on the Project Budget form.

Figures are recalculated live with the controller's own `recalculate_budget()` on an
in-memory copy (nothing is saved), so the tab shows today's position even when the
form's stored totals date from its last save. Committed and actual follow the app's
definitions: submitted Purchase Orders, and submitted Purchase Invoices plus approved
Timesheets, matched by project and cost head.
"""

import frappe
from frappe.utils import cint, date_diff, flt, getdate, today

from epcforge.utils import ignore_active_project

SOURCES = {"committed": "Purchase Order", "actual": "Purchase Invoice"}


@frappe.whitelist()
def get_dashboard_data(name: str) -> dict:
	frappe.has_permission("Project Budget", "read", name, throw=True)
	with ignore_active_project():
		return BudgetDashboard(frappe.get_doc("Project Budget", name)).build()


class BudgetDashboard:
	def __init__(self, budget):
		self.budget = budget
		self.budget.recalculate_budget()  # in memory only; the document is not saved
		self.project = frappe.db.get_value("Project", budget.project, ["company", "project_name", "status", "percent_complete",
			"expected_start_date", "expected_end_date"], as_dict=True) if budget.project else frappe._dict()
		company_ccy = frappe.get_cached_value("Company", self.project.company, "default_currency") if self.project.get("company") else None
		self.currency = company_ccy or frappe.db.get_single_value("EPCForge Settings", "default_currency") \
			or frappe.defaults.get_global_default("currency")

	def build(self):
		b = self.budget
		symbol, on_right = frappe.get_cached_value("Currency", self.currency, ["symbol", "symbol_on_right"]) or ("", 0)
		return {
			"name": b.name, "project": b.project, "project_name": b.project_name or self.project.get("project_name"),
			"boq": b.boq, "client": b.client, "role": b.epc_role, "discipline": b.epc_discipline, "today": today(),
			"currency": self.currency, "currency_symbol": symbol or self.currency, "currency_symbol_on_right": cint(on_right),
			"contract_value": flt(b.contract_value), "budget": flt(b.approved_budget), "committed": flt(b.committed_amount),
			"actual": flt(b.actual_cost), "remaining": flt(b.remaining_budget), "cost_variance": flt(b.cost_variance),
			"used_pct": flt(b.percent_used), "cpi": flt(b.cpi), "spi": flt(b.epc_spi), "eac": flt(b.eac),
			"health": b.epc_health, "schedule_status": b.epc_sched_status, "manual_evm": cint(b.manual_evm_override),
			"evm": self._evm(),
			"heads": self._heads(),
			"can_read": {dt: frappe.has_permission(dt, "read") for dt in SOURCES.values()},
		}

	def _evm(self):
		"""Planned and earned value with the controller's formulas (see calculate_evm)."""
		budget, p = flt(self.budget.approved_budget), self.project
		progress = flt(p.get("percent_complete"))
		start, end = p.get("expected_start_date"), p.get("expected_end_date")
		if start and end and getdate(end) > getdate(start):
			elapsed = max(0, date_diff(today(), start))
			planned_pct = min(elapsed / date_diff(end, start), 1.0) * 100
		else:
			planned_pct = progress
		return {"progress_pct": progress, "planned_pct": planned_pct, "planned_value": budget * planned_pct / 100,
			"earned_value": budget * progress / 100, "start": start, "end": end, "project_status": p.get("status")}

	def _heads(self):
		docs = {key: self._documents(doctype) for key, doctype in SOURCES.items()}
		rows = []
		for item in self.budget.budget_items:
			used = flt(item.committed_amount) + flt(item.actual_amount)
			rows.append({"cost_head": item.cost_head, "description": item.description, "budget": flt(item.budget_amount),
				"committed": flt(item.committed_amount), "actual": flt(item.actual_amount), "remaining": flt(item.remaining_balance),
				"used_pct": used / flt(item.budget_amount) * 100 if flt(item.budget_amount) else 0, "status": item.status,
				"po": docs["committed"].get(item.cost_head, []), "pi": docs["actual"].get(item.cost_head, [])})
		return rows

	def _documents(self, doctype):
		"""Names of the submitted documents behind each cost head, as the user may read them."""
		if not self.budget.project or not frappe.has_permission(doctype, "read"):
			return {}
		out = {}
		for row in frappe.get_list(doctype, filters={"project": self.budget.project, "docstatus": 1, "epc_cost_head": ["is", "set"]},
			fields=["name", "epc_cost_head"], limit_page_length=0):
			out.setdefault(row.epc_cost_head, []).append(row.name)
		return out
