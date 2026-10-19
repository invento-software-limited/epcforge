app_name = "epcforge"
app_title = "EPCForge"
app_publisher = "Invento Software Limited"
app_description = "EPC Operations, BOQ & Budget Management"
app_email = "hello@invento.com.bd"
app_license = "mit"
app_logo_url = "/assets/epcforge/img/epcforge-logo.svg"

from . import __version__ as app_version

# Apps
# ------------------
required_apps = ["erpnext"]

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "epcforge",
		# The full wordmark lockup (epcforge-logo.svg) is 600x200 — not square, so it rendered
		# squeezed/pale in the icon tile. This is a square-cropped, solid version of just its
		# hexagon+gear mark, sized for a 1:1 tile.
		"logo": "/assets/epcforge/img/epcforge-icon.svg",
		"title": "EPCForge",
		# Was "/epcforge" — a bare app-name path with no page behind it (404 in v16). The desk's
		# apps-screen passes this through unresolved as the icon's href, so it has to be a real
		# route: the public "EPCForge" workspace, the first item in the app's own sidebar.
		"route": "/desk/epcforge",
	}
]

# include js in doctype views
doctype_js = {
	"Project": "public/js/project.js",
	"Task": "public/js/task.js",
	"BOQ": [
		"public/js/boq.js",
		"public/js/boq_dashboard/format.js",
		"public/js/boq_dashboard/charts.js",
		"public/js/boq_dashboard/page_charts.js",
		"public/js/boq_dashboard/styles.js",
		"public/js/boq_dashboard/markup.js",
		"public/js/boq_dashboard/sections.js",
		"public/js/boq_dashboard/dashboard.js",
	],
	"Project Budget": [
		"public/js/boq_dashboard/format.js",
		"public/js/boq_dashboard/charts.js",
		"public/js/boq_dashboard/page_charts.js",
		"public/js/boq_dashboard/styles.js",
		"public/js/budget_dashboard/markup.js",
		"public/js/budget_dashboard/dashboard.js",
	],
}

# include js, css files in header of desk.html
app_include_js = ["epcforge.bundle.js"]
app_include_css = ["epcforge.bundle.css"]

# Permissions
# -----------
permission_query_conditions = {"*": "epcforge.utils.get_project_query_conditions"}

# Document Events
# ---------------
doc_events = {
	"Purchase Order": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_order_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_order_update",
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_order_update",
	},
	"Purchase Invoice": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_invoice_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_invoice_update",
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_invoice_update",
	},
	"Purchase Receipt": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_receipt_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_receipt_update",
	},
	"Stock Entry": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_stock_entry_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_stock_entry_update",
	},
	"Timesheet": {
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_timesheet_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_timesheet_update",
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_timesheet_update",
	},
	"Project": {
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_project_update",
		"after_insert": [
			"epcforge.utils.update_session_default_project",
			"epcforge.utils.create_boq_from_project_template",
		],
	},
	"Task": {
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_task_update",
	},
	"Sales Invoice": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"validate": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_sales_invoice_validate",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_sales_invoice_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_sales_invoice_update",
	},
}

# Installation
# ------------
after_migrate = ["epcforge.utils.after_migrate"]

# Scheduled Tasks
# ---------------
# scheduler_events = {
# 	"daily": [
# 		"epcforge.tasks.daily"
# 	],
# }

# Fixtures
# ---------------
fixtures = ["Session Default Settings"]

# Standard Reports
# ---------------
reports = ["epcforge.epcforge.report.tender_summary.tender_summary"]

# Toolbar
# ---------------
# Was setting website_context.favicon/splash_image, which Frappe applies site-wide
# (it's merged into every page's render context, not scoped to EPCForge's own pages),
# forcing EPCForge's branding onto the whole site for every app. Removed.
