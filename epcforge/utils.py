# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def after_migrate():
	"""Called after migrating the app"""
	create_default_boq_groups()
	create_default_budget_cost_heads()


def create_default_boq_groups():
	"""Seed default BOQ groups if none exist"""
	if frappe.db.count("BOQ Group") > 0:
		return

	groups = [
		{"name": "Engineering & Design", "is_group": 1},
		{"name": "Civil & Structural Works", "is_group": 1},
		{"name": "Mechanical Works", "is_group": 1},
		{"name": "Electrical Works", "is_group": 1},
		{"name": "Instrumentation & Control", "is_group": 1},
		{"name": "Piping Works", "is_group": 1},
		{"name": "HVAC Works", "is_group": 1},
		{"name": "Telecom & IT", "is_group": 1},
		{"name": "Testing & Commissioning", "is_group": 1},
		{"name": "Project Management & Administration", "is_group": 1},
	]

	for group in groups:
		if not frappe.db.exists("BOQ Group", group["name"]):
			doc = frappe.new_doc("BOQ Group")
			doc.boq_group_name = group["name"]
			doc.is_group = group["is_group"]
			doc.insert(ignore_permissions=True)

	# Commit seeded BOQ groups after migration setup
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def create_default_budget_cost_heads():
	"""Seed default budget cost heads if none exist"""
	if frappe.db.count("Budget Cost Head") > 0:
		return

	heads = [
		{"name": "Direct Materials", "is_group": 1},
		{"name": "Labour & Manpower", "is_group": 1},
		{"name": "Equipment & Machinery", "is_group": 1},
		{"name": "Subcontract", "is_group": 1},
		{"name": "Overheads", "is_group": 1},
		{"name": "Contingency", "is_group": 0},
	]

	for head in heads:
		if not frappe.db.exists("Budget Cost Head", head["name"]):
			doc = frappe.new_doc("Budget Cost Head")
			doc.cost_head_name = head["name"]
			doc.is_group = head["is_group"]
			doc.insert(ignore_permissions=True)

	# Commit seeded budget cost heads after migration setup
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def get_project_query_conditions(user):
	"""Permission query conditions for project-scoped access"""
	return ""
