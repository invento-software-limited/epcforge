// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt
//
// EPCForge sidebar "Active Project" switcher. Injects a card into the Desk
// sidebar whenever it detects it's looking at EPCForge's own workspace
// sidebar, lets the user pick a project from a dialog, and stamps every
// outgoing request with a header that epcforge.utils.get_project_query_conditions
// uses to scope list views to that project while inside EPCForge.

frappe.epcforge = frappe.epcforge || {};
frappe.epcforge.projects = null;
frappe.epcforge.active_project = null;
frappe.epcforge.dialog = null;
frappe.epcforge.is_active_sidebar = false;

frappe.epcforge.fetch_projects = function (callback) {
	if (frappe.epcforge.projects) {
		if (callback) callback(frappe.epcforge.projects);
		return;
	}
	frappe.call({
		method: "epcforge.epcforge.page.project_dashboard.project_dashboard.get_projects_list",
		callback: function (r) {
			frappe.epcforge.projects = r.message || [];
			const active = frappe.epcforge.projects.find((p) => p.is_active);
			frappe.epcforge.active_project = active ? active.value : null;
			if (callback) callback(frappe.epcforge.projects);
		},
	});
};

frappe.epcforge.update_sidebar_card = function (project_id) {
	if (!frappe.epcforge.projects) return;
	const project = frappe.epcforge.projects.find((p) => p.value === project_id);
	if (!project) return;

	$("#epc-ap-name-sidebar").text(project.label);
	const pct = Math.round(project.percent_complete || 0);
	$("#epc-ap-status-sidebar .epc-ap-text").text(`${project.status} (${pct}%)`);

	const $badge = $("#epc-ap-status-sidebar");
	$badge.removeClass("status-completed status-hold status-cancelled");
	if (project.status === "Completed") $badge.addClass("status-completed");
	else if (project.status === "On Hold" || project.status === "Suspended")
		$badge.addClass("status-hold");
	else if (project.status === "Cancelled") $badge.addClass("status-cancelled");
};

frappe.epcforge.open_project_switch_dialog = function () {
	frappe.epcforge.fetch_projects(function (projects) {
		if (!projects || !projects.length) {
			frappe.msgprint(__("No Projects found."));
			return;
		}
		if (frappe.epcforge.dialog) {
			frappe.epcforge.dialog.show();
			return;
		}

		const d = new frappe.ui.Dialog({ title: __("Switch Active Project"), size: "small" });
		d.$body.html(`
			<div class="epc-project-dialog-wrap">
				<div style="margin-bottom: 16px;">
					<input type="text" id="epc-project-search-input" class="form-control"
						placeholder="${__("Search projects...")}" autocomplete="off" style="font-size: 13px;">
				</div>
				<div class="epc-project-dialog-list"></div>
			</div>
		`);

		const $search = d.$wrapper.find("#epc-project-search-input");
		const $list = d.$wrapper.find(".epc-project-dialog-list");

		function render_list(filter_text) {
			$list.empty();
			const query = (filter_text || "").toLowerCase();
			const filtered = projects.filter(
				(p) =>
					p.label.toLowerCase().includes(query) || p.value.toLowerCase().includes(query)
			);

			if (!filtered.length) {
				$list.append(
					`<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">${__(
						"No matching projects found"
					)}</div>`
				);
				return;
			}

			filtered.forEach((p) => {
				const is_active = p.value === frappe.epcforge.active_project;
				const pct = Math.round(p.percent_complete || 0);
				let badge_class = "";
				if (p.status === "Completed") badge_class = "status-completed";
				else if (p.status === "On Hold" || p.status === "Suspended")
					badge_class = "status-hold";
				else if (p.status === "Cancelled") badge_class = "status-cancelled";

				const $item = $(`
					<div class="epc-project-list-item ${is_active ? "active" : ""}" data-value="${p.value}">
						<div class="epc-proj-info">
							<span class="epc-proj-name">${frappe.utils.escape_html(p.label)}</span>
							<span class="epc-proj-code">${frappe.utils.escape_html(p.value)}</span>
						</div>
						<span class="epc-ap-status-badge ${badge_class}">
							<span class="epc-ap-dot">●</span>
							<span class="epc-ap-text">${frappe.utils.escape_html(p.status)} (${pct}%)</span>
						</span>
					</div>
				`);

				$item.on("click", function () {
					const val = $(this).data("value");
					if (val && val !== frappe.epcforge.active_project) {
						frappe.call({
							method: "epcforge.utils.set_active_project",
							args: { project_id: val },
							callback: function (r) {
								if (r.message && r.message.status === "success") {
									frappe.epcforge.projects = null;
									frappe.epcforge.active_project = val;
									window.location.reload();
								}
							},
						});
					}
					d.hide();
				});

				$list.append($item);
			});
		}

		$search.on("input", function () {
			render_list($(this).val());
		});
		d.on_page_show = function () {
			$search.val("").focus();
			render_list("");
		};
		d.onhide = function () {
			frappe.epcforge.dialog = null;
		};
		frappe.epcforge.dialog = d;
		d.show();
	});
};

frappe.epcforge.check_is_epcforge_sidebar = function () {
	const $sidebar = $(".body-sidebar");
	if (!$sidebar.length) return false;

	if ($sidebar.find('[data-link-to="project-dashboard"]').length > 0) return true;

	const text = $sidebar.text() || "";
	return text.indexOf("EPC Operations") !== -1 && text.indexOf("Master Data") !== -1;
};

frappe.epcforge.render_sidebar_widget = function () {
	if (!frappe.session || frappe.session.user === "Guest") return;

	const is_epc = frappe.epcforge.check_is_epcforge_sidebar();
	frappe.epcforge.is_active_sidebar = is_epc;

	const $deskSidebar = $(".body-sidebar .sidebar-items");
	if (!$deskSidebar.length) return;

	if (!is_epc) {
		$deskSidebar.find(".epc-sidebar-wrap").remove();
		return;
	}
	if ($deskSidebar.find(".epc-sidebar-wrap").length) return;

	$deskSidebar.prepend(`
		<div class="epc-sidebar-wrap">
			<div class="epc-active-project-card" id="epc-sidebar-active-project-card">
				<div class="epc-ap-lbl">${__("Active Project")}</div>
				<div class="epc-ap-name" id="epc-ap-name-sidebar">—</div>
				<div class="epc-ap-status-wrap">
					<span class="epc-ap-status-badge" id="epc-ap-status-sidebar">
						<span class="epc-ap-dot">●</span> <span class="epc-ap-text">${__("Open")}</span>
					</span>
				</div>
			</div>
		</div>
	`);

	frappe.epcforge.fetch_projects(function (projects) {
		if (projects && projects.length) {
			frappe.epcforge.update_sidebar_card(frappe.epcforge.active_project);
		}
	});

	$("#epc-sidebar-active-project-card").on("click", function () {
		frappe.epcforge.open_project_switch_dialog();
	});
};

$(document).ready(function () {
	$(document).ajaxSend(function (event, jqxhr) {
		if (window.frappe && frappe.epcforge && frappe.epcforge.is_active_sidebar) {
			jqxhr.setRequestHeader("X-Epc-Active", "1");
		}
	});

	if (frappe.ui.Sidebar) {
		const orig_create_sidebar = frappe.ui.Sidebar.prototype.create_sidebar;
		frappe.ui.Sidebar.prototype.create_sidebar = function (items) {
			orig_create_sidebar.apply(this, arguments);
			frappe.epcforge.render_sidebar_widget();
			setTimeout(frappe.epcforge.render_sidebar_widget, 300);
		};
	}

	$(document).on("page-change", function () {
		frappe.epcforge.projects = null;
		frappe.epcforge.render_sidebar_widget();
		setTimeout(frappe.epcforge.render_sidebar_widget, 300);
	});
});
