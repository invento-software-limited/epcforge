# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from epcforge import report_kit as kit
from epcforge.utils import ignore_active_project


def execute(filters=None):
	columns = get_columns()
	# The report has its own Project filter; the sidebar's active-project list scope does not apply.
	with ignore_active_project():
		data = get_data(filters)
	return columns, data, get_meta(filters, data)


def get_columns():
	return [
		{
			"label": _("Project"),
			"fieldname": "project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 180,
		},
		{
			"label": _("Budget"),
			"fieldname": "budget_name",
			"fieldtype": "Link",
			"options": "Project Budget",
			"width": 180,
		},
		{
			"label": _("Cost Head"),
			"fieldname": "cost_head",
			"fieldtype": "Link",
			"options": "Budget Cost Head",
			"width": 150,
		},
		{"label": _("Description"), "fieldname": "description", "fieldtype": "Data", "width": 200},
		{"label": _("Budget Amount"), "fieldname": "budget_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Committed"), "fieldname": "committed_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Actual"), "fieldname": "actual_amount", "fieldtype": "Currency", "width": 130},
		{"label": _("Remaining"), "fieldname": "remaining_balance", "fieldtype": "Currency", "width": 130},
		{"label": _("% Used"), "fieldname": "percent_used", "fieldtype": "Percent", "width": 90},
	]


def get_data(filters):
	filters = filters or {}
	parent_filters = [["docstatus", "<", 2]]
	if filters.get("project"):
		parent_filters.append(["project", "=", filters.get("project")])
	budgets = {b.name: b for b in frappe.get_list("Project Budget", filters=parent_filters, fields=["name", "project"], limit_page_length=0)}
	if not budgets:
		return []
	item_filters = {"parent": ["in", list(budgets)], "parenttype": "Project Budget"}
	if filters.get("cost_head"):
		item_filters["cost_head"] = filters.get("cost_head")
	rows = frappe.get_all("Project Budget Item", filters=item_filters, order_by="cost_head asc",
		fields=["parent", "cost_head", "description", "budget_amount", "committed_amount", "actual_amount", "remaining_balance"])
	data = []
	for row in rows:
		budget = row.budget_amount or 0
		data.append({"project": budgets[row.parent].project, "budget_name": row.parent, "cost_head": row.cost_head,
			"description": row.description, "budget_amount": budget, "committed_amount": row.committed_amount,
			"actual_amount": row.actual_amount, "remaining_balance": row.remaining_balance,
			"percent_used": ((row.committed_amount or 0) + (row.actual_amount or 0)) / budget * 100 if budget else 0})
	return sorted(data, key=lambda r: (r["project"] or "", r["cost_head"] or ""))


def get_meta(filters, data):
	"""Header cards and charts from the table's rows."""
	budget = kit.total(data, lambda r: r["budget_amount"])
	used = lambda r: (r["committed_amount"] or 0) + (r["actual_amount"] or 0)
	heads = kit.group(data, lambda r: r["cost_head"], lambda r: r["budget_amount"])
	for h in heads:
		rows = [r for r in data if r["cost_head"] == h["key"]]
		h["committed"] = kit.total(rows, lambda r: r["committed_amount"])
		h["actual"] = kit.total(rows, lambda r: r["actual_amount"])
		h["used_pct"] = kit.pct(h["committed"] + h["actual"], h["value"])
	return kit.meta(
		budget=budget,
		budgets=len({r["budget_name"] for r in data}),
		committed=kit.total(data, lambda r: r["committed_amount"]),
		actual=kit.total(data, lambda r: r["actual_amount"]),
		remaining=kit.total(data, lambda r: r["remaining_balance"]),
		used_pct=kit.pct(kit.total(data, used), budget),
		heads=heads,
		projects=kit.group(data, lambda r: r["project"], lambda r: r["budget_amount"]),
	)
