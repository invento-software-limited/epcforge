# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

"""Data for the Dashboard tab on the BOQ form.

Amounts are in the currency of the project's company. Procurement covers stock
Material lines only (the lines a Material Request can be raised for) and is
measured in value, line by line, so quantities in different UOMs are never added
together. Linked documents are found through their item rows' `custom_boq_item`
and read with the user's permissions.
"""

import frappe
from frappe.utils import cint, flt, getdate, today

from epcforge.utils import ignore_active_project

PROCUREMENT = (
	# (doctype, child doctype, docstatus filter, value field on the child row)
	("Material Request", "Material Request Item", ["!=", 2], None),
	("Purchase Order", "Purchase Order Item", ["=", 1], "base_amount"),
	("Purchase Receipt", "Purchase Receipt Item", ["=", 1], "base_amount"),
)


@frappe.whitelist()
def get_dashboard_data(name: str) -> dict:
	frappe.has_permission("BOQ", "read", name, throw=True)
	with ignore_active_project():
		return BOQDashboard(frappe.get_doc("BOQ", name)).build()


class BOQDashboard:
	def __init__(self, boq):
		self.boq = boq
		project = frappe.db.get_value("Project", boq.project, ["company", "project_name", "status", "percent_complete",
			"expected_start_date", "expected_end_date"], as_dict=True) if boq.project else None
		self.project = project or frappe._dict()
		self.currency = (frappe.get_cached_value("Company", self.project.company, "default_currency") if self.project.get("company") else None) \
			or frappe.db.get_single_value("EPCForge Settings", "default_currency") or frappe.defaults.get_global_default("currency")

	def build(self):
		boq = self.boq
		symbol, on_right = frappe.get_cached_value("Currency", self.currency, ["symbol", "symbol_on_right"]) or ("", 0)
		milestones = self._milestones()
		billed = sum(m["amount"] for m in milestones if m["status"] in ("Invoiced", "Received"))
		return {
			"name": boq.name, "project": boq.project, "project_name": boq.project_name or self.project.get("project_name"),
			"contract_type": boq.contract_type, "status": boq.status, "docstatus": boq.docstatus, "revision": cint(boq.revision),
			"project_status": self.project.get("status"), "project_complete": flt(self.project.get("percent_complete")),
			"start_date": self.project.get("expected_start_date"), "end_date": self.project.get("expected_end_date"),
			"currency": self.currency, "currency_symbol": symbol or self.currency, "currency_symbol_on_right": cint(on_right),
			"today": today(),
			"contract_value": flt(boq.total_amount), "estimated_cost": flt(boq.estimated_cost), "actual_cost": flt(boq.actual_cost),
			"gross_margin_pct": flt(boq.gross_margin_pct), "budget_variance": flt(boq.budget_variance),
			"line_count": len(boq.boq_items),
			"by_type": self._by_type(),
			"billed": billed,
			"received": sum(m["amount"] for m in milestones if m["status"] == "Received"),
			"milestones": milestones,
			"procurement": self._procurement(),
			"can_read": {dt: frappe.has_permission(dt, "read") for dt, *_ in PROCUREMENT},
		}

	def _by_type(self):
		types = {}
		for row in self.boq.boq_items:
			t = types.setdefault(row.item_type or "Material", {"type": row.item_type or "Material", "lines": 0,
				"contract": 0.0, "estimated": 0.0, "actual": 0.0, "complete_weighted": 0.0})
			t["lines"] += 1
			t["contract"] += flt(row.amount)
			t["estimated"] += flt(row.estimated_cost)
			t["actual"] += flt(row.actual_cost)
			t["complete_weighted"] += flt(row.amount) * flt(row.percent_complete)
		for t in types.values():
			t["margin_pct"] = (t["contract"] - t["estimated"]) / t["contract"] * 100 if t["contract"] else 0
			t["complete_pct"] = t.pop("complete_weighted") / t["contract"] if t["contract"] else 0
		return sorted(types.values(), key=lambda t: -t["contract"])

	def _milestones(self):
		rows = []
		for r in self.boq.get("boq_payment_schedule") or []:
			status = r.payment_status or "Pending"
			due = r.target_date and getdate(r.target_date) < getdate(today()) and status == "Pending"
			rows.append({"milestone": r.milestone, "task": r.linked_wbs, "target_date": r.target_date,
				"percent": flt(r.percent_amount), "amount": flt(r.amount), "net_payable": flt(r.net_payable),
				"retention": flt(r.retention_amount), "advance_deduction": flt(r.advance_deduction),
				"status": status, "sales_invoice": r.sales_invoice, "overdue": bool(due),
				"unlinked": status in ("Invoiced", "Received") and not r.sales_invoice})
		return sorted(rows, key=lambda m: str(m["target_date"] or "9999"))

	def _procurement(self):
		lines = [r for r in self.boq.boq_items if r.item_type == "Material" and r.boq_code
			and frappe.get_cached_value("Item", r.boq_code, "is_stock_item")]
		by_line = {r.name: {"row": r.name, "item_code": r.boq_code, "description": r.description or r.boq_code,
			"uom": r.uom or "", "qty": flt(r.qty), "rate": flt(r.rate), "value": flt(r.qty) * flt(r.rate),
			"mr_qty": 0.0, "po_qty": 0.0, "pr_qty": 0.0, "po_value": 0.0, "pr_value": 0.0} for r in lines}
		docs = {}
		for doctype, child, docstatus, value_field in PROCUREMENT:
			key = {"Material Request": "mr", "Purchase Order": "po", "Purchase Receipt": "pr"}[doctype]
			docs[key] = []
			for row in self._child_rows(doctype, child, docstatus, value_field, list(by_line)):
				line = by_line[row.custom_boq_item]
				line[f"{key}_qty"] += flt(row.qty)
				if value_field:
					line[f"{key}_value"] += flt(row.get(value_field))
				if row.parent not in docs[key]:
					docs[key].append(row.parent)
		value = sum(l["value"] for l in by_line.values())
		requested = sum(min(l["mr_qty"], l["qty"]) * l["rate"] for l in by_line.values())
		ordered = sum(l["po_value"] for l in by_line.values())
		received = sum(l["pr_value"] for l in by_line.values())
		for l in by_line.values():
			for key in ("mr", "po", "pr"):
				l[f"{key}_pct"] = min(l[f"{key}_qty"] / l["qty"] * 100, 100) if l["qty"] else 0
		pct = lambda v: v / value * 100 if value else 0
		return {"lines": list(by_line.values()), "value": value, "requested": requested, "ordered": ordered,
			"received": received, "requested_pct": pct(requested), "ordered_pct": pct(ordered),
			"received_pct": pct(received), "documents": docs}

	def _child_rows(self, doctype, child, docstatus, value_field, line_names):
		"""Item rows pointing at these BOQ lines, on parents the user may read."""
		if not line_names or not frappe.has_permission(doctype, "read"):
			return []
		parents = frappe.get_list(doctype, filters=[[doctype, "docstatus", *docstatus],
			[child, "custom_boq_item", "in", line_names]], pluck="name", limit_page_length=0, distinct=True)
		if not parents:
			return []
		fields = ["parent", "custom_boq_item", "qty", *([value_field] if value_field else [])]
		return frappe.get_all(child, filters={"parent": ["in", parents], "custom_boq_item": ["in", line_names]}, fields=fields)
