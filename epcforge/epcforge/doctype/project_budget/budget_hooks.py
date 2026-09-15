# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt, nowdate


# ---------------------------------------------------------------------------
# Enqueue helpers
# ---------------------------------------------------------------------------
def handle_budget_update(project):
	if not project:
		return
	frappe.enqueue(
		"epcforge.epcforge.doctype.project_budget.budget_hooks.run_budget_update_in_background",
		project=project,
		queue="short",
		job_id=f"epcforge-budget-update-{project}",
		deduplicate=True,
	)


def handle_boq_update(project):
	if not project:
		return
	frappe.enqueue(
		"epcforge.epcforge.doctype.project_budget.budget_hooks.run_boq_update_in_background",
		project=project,
		queue="short",
		job_id=f"epcforge-boq-update-{project}",
		deduplicate=True,
	)


def run_budget_update_in_background(project):
	budget_name = frappe.db.get_value("Project Budget", {"project": project}, "name")
	if not budget_name:
		return
	doc = frappe.get_doc("Project Budget", budget_name)
	doc.save(ignore_permissions=True)


def run_boq_update_in_background(project):
	boq_name = frappe.db.get_value("BOQ", {"project": project, "docstatus": ["!=", 2]}, "name")
	if not boq_name:
		return
	doc = frappe.get_doc("BOQ", boq_name)
	# BOQ.before_save / before_update_after_submit both run the full recompute
	# pipeline (populate_payment_schedule_from_milestones, calculate_totals, ...),
	# and the fields/tables it touches are allow_on_submit, so a plain save()
	# works whether the BOQ is a Draft or already Approved.
	doc.save(ignore_permissions=True)


# ---------------------------------------------------------------------------
# BOQ header link (drives the BOQ form's Connections tab)
# ---------------------------------------------------------------------------
def set_boq_link(doc, method):
	"""Stamp custom_boq on new Purchase Order/Invoice/Receipt, Stock Entry, and
	Sales Invoice docs from their Project's active BOQ, so the BOQ's own
	Connections tab shows them (mirrors what create_material_request already
	does for Material Request).
	"""
	if doc.get("custom_boq") or not doc.get("project"):
		return
	doc.custom_boq = frappe.db.get_value("BOQ", {"project": doc.project, "docstatus": ["!=", 2]}, "name")


# ---------------------------------------------------------------------------
# Purchase Order / Purchase Invoice / Purchase Receipt / Stock Entry / Timesheet
# ---------------------------------------------------------------------------
def on_purchase_order_update(doc, method):
	handle_budget_update(doc.project)


def on_purchase_invoice_update(doc, method):
	handle_budget_update(doc.project)


def on_purchase_receipt_update(doc, method):
	projects = {row.project for row in doc.items if row.project} or (
		{doc.get("project")} if doc.get("project") else set()
	)
	for project in projects:
		handle_boq_update(project)


def on_stock_entry_update(doc, method):
	projects = {row.project for row in doc.items if row.project}
	for project in projects:
		handle_boq_update(project)


def on_timesheet_update(doc, method):
	projects = {row.project for row in doc.time_logs if row.project}
	for project in projects:
		handle_budget_update(project)


# ---------------------------------------------------------------------------
# Project / Task
# ---------------------------------------------------------------------------
def on_project_update(doc, method):
	handle_budget_update(doc.name)
	handle_boq_update(doc.name)


def on_task_update(doc, method):
	linked_items = frappe.get_all("BOQ Item", filters={"linked_wbs": doc.name}, fields=["name", "parent"])
	if linked_items:
		progress = 100 if doc.status == "Completed" else flt(doc.progress)
		for row in linked_items:
			target_pct = progress
			if target_pct > 80:
				qc_ok = frappe.db.exists(
					"Quality Inspection", {"custom_boq_item": row.name, "status": "Accepted"}
				)
				if not qc_ok:
					target_pct = 80
			frappe.db.set_value("BOQ Item", row.name, "percent_complete", target_pct)

		for parent in {row.parent for row in linked_items}:
			project = frappe.db.get_value("BOQ", parent, "project")
			if project:
				handle_boq_update(project)

	if doc.get("custom_is_billing_milestone"):
		schedule_row = frappe.db.get_value(
			"BOQ Payment Schedule",
			{"linked_wbs": doc.name, "payment_status": "Pending"},
			["name", "parent"],
			as_dict=True,
		)
		if schedule_row:
			frappe.db.set_value(
				"BOQ Payment Schedule",
				schedule_row.name,
				{
					"milestone": doc.subject,
					"percent_amount": flt(doc.get("epc_billing_weightage")),
					"target_date": doc.exp_end_date,
				},
			)
			project = frappe.db.get_value("BOQ", schedule_row.parent, "project")
			if project:
				handle_boq_update(project)
		elif doc.project:
			# No payment-schedule row exists for this Task yet - it was just flagged
			# as a billing milestone. Run synchronously (not via handle_boq_update's
			# queue) so the row is there the moment the user's save returns - this
			# is a rare, deliberate action, not a high-frequency recalc trigger.
			run_boq_update_in_background(doc.project)


# ---------------------------------------------------------------------------
# Sales Invoice (progress billing)
# ---------------------------------------------------------------------------
def on_sales_invoice_validate(doc, method):
	if not doc.get("epc_linked_milestone"):
		return

	boq_name = frappe.db.get_value("BOQ", {"project": doc.project, "docstatus": ["!=", 2]}, "name")
	if boq_name:
		retention_pct = frappe.db.get_value("BOQ", boq_name, "retention_pct") or 0
		if not doc.get("epc_retention_percent"):
			doc.epc_retention_percent = retention_pct

	doc.epc_retention_amount = flt(doc.grand_total) * flt(doc.get("epc_retention_percent")) / 100.0
	doc.epc_net_payable = flt(doc.grand_total) - doc.epc_retention_amount
	doc.epc_billing_period = frappe.utils.formatdate(doc.posting_date or nowdate(), "MMMM yyyy")


def on_sales_invoice_update(doc, method):
	if not doc.get("epc_linked_milestone"):
		return

	row = frappe.db.get_value(
		"BOQ Payment Schedule", {"linked_wbs": doc.epc_linked_milestone}, ["name", "parent"], as_dict=True
	)
	if not row:
		return

	if doc.docstatus == 1:
		frappe.db.set_value(
			"BOQ Payment Schedule", row.name, {"sales_invoice": doc.name, "payment_status": "Invoiced"}
		)
	elif doc.docstatus == 2:
		frappe.db.set_value(
			"BOQ Payment Schedule", row.name, {"sales_invoice": None, "payment_status": "Pending"}
		)

	project = frappe.db.get_value("BOQ", row.parent, "project")
	if project:
		handle_boq_update(project)
