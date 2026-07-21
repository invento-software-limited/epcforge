<p align="center">
  <img src="https://raw.githubusercontent.com/invento-software-limited/epcforge/main/epcforge/public/img/epcforge-logo.svg" width="260" alt="EPCForge Logo">
</p>

<h1 align="center">EPCForge</h1>

<p align="center">
  <strong>Engineering, Procurement & Construction Management for Frappe / ERPNext v16</strong>
</p>

<p align="center">
  <a href="https://github.com/invento-software-limited/epcforge/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-teal.svg" alt="License: MIT"></a>
  <a href="https://invento-software-limited.github.io/epcforge/"><img src="https://img.shields.io/badge/Docs-GitHub%20Pages-0d9488.svg" alt="Documentation"></a>
  <a href="https://frappe.io"><img src="https://img.shields.io/badge/Frappe-v16.0.0+-orange.svg" alt="Frappe Version"></a>
  <a href="https://erpnext.com"><img src="https://img.shields.io/badge/ERPNext-v16.0.0+-blue.svg" alt="ERPNext Version"></a>
</p>

---

## 📦 About EPCForge

**EPCForge** is an enterprise-grade Frappe application designed for Engineering, Procurement, and Construction (EPC) firms, main contractors, estimation engineers, and project managers. Built specifically for **Frappe v16** and **ERPNext v16**, it extends ERPNext with hierarchical Bill of Quantities (BOQ), baseline budget tracking, vendor tender management, and an engineering document control register.

Whether managing multi-million-dollar infrastructure projects or commercial builds, EPCForge unifies cost estimation, tender bidding, document submittals, and financial tracking directly inside your ERPNext Desk.

---

## ✨ Detailed Features

### 🎯 BOQ (Bill of Quantities) Engine
- **Hierarchical Structure**: Multi-level BOQ tree with parent/child sections and line items.
- **Automated Pricing**: Quantity × Unit Rate calculations with customizable profit margin percentages.
- **Milestone Payment Schedules**: Link BOQ items to project billing milestones and percentage payouts.
- **Revision Audit History**: Track changes across project stages with `amended_from` baseline history.

### 💾 Project Budgeting & Cost Control
- **Cost Head Allocation**: Link BOQ sections directly to custom budget heads (Material, Labor, Equipment, Subcontractor).
- **Target vs. Actual Variance**: Live calculation of committed amounts, actual expenditure from GL entries, and remaining balances.
- **Overrun Protection**: Real-time variance warnings when Purchase Orders or Material Requests exceed target thresholds.

### 🔌 Tender & Bidder Management
- **Full Tender Lifecycle**: Draft → Open → Under Evaluation → Awarded → Cancelled.
- **Flexible Classifications**: Support for Open Tenders, Selective Bidding, Negotiated Tenders, and Single Source awards.
- **Bidder Invitations**: Track invited suppliers, bid submission status, commercial scores, and evaluation notes.
- **Executive Reporting**: Integrated **Tender Summary** report for contract pipeline insights.

### ⚡ Engineering Document Register
- **Centralized Control**: Classify engineering assets into Drawings, Specifications, RFIs, Submittals, and NCRs.
- **Revision & Versioning**: Strict revision tracking (Rev A, B, C...) to ensure teams work on current drawings.
- **Workflow Approval**: Configurable review states (`Draft` → `Under Review` → `Approved` → `Issued`).

### 📊 Reports & Dashboards
- **Tender Summary Report**: Consolidated view of open, evaluated, and awarded tender packages.
- **BOQ Summary Report**: Itemized breakdown of rates, margins, and section totals.
- **Budget vs. Actual Report**: Variance report comparing planned allocations to financial actuals.
- **Desk Dashboards**: Interactive charts and number cards for active project status and pending document reviews.

---

## 💻 Prerequisites & Compatibility

- **Frappe Framework**: `v16.0.0` or higher (`>=16.0.0,<17.0.0`)
- **ERPNext**: `v16.0.0` or higher (`>=16.0.0,<17.0.0`)
- **Python**: `3.10` or higher

---

## ⚙️ Installation

Install EPCForge on your Frappe bench using the Bench CLI:

```bash
# Navigate to your bench directory
cd ~/frappe-bench

# Fetch the repository
bench get-app https://github.com/invento-software-limited/epcforge

# Install on your target site
bench --site [your-site-name] install-app epcforge

# Build assets & run migrations
bench build
bench --site [your-site-name] migrate
```

---

## 🚀 Quick Start & Usage Workflow

1. **Set Up Project**: Create or open a project in ERPNext standard **Project** master.
2. **Build BOQ**: Click **EPCForge** → **New BOQ** on the Project form. Add sections, line items, unit rates, and target margins, then Submit.
3. **Establish Budget**: Select **EPCForge** → **Create Budget** to allocate cost heads against the approved BOQ baseline.
4. **Float Tenders**: Go to **EPCForge** → **Tenders** to invite bidders, compare bids, and record awards.
5. **Register Documents**: Go to **EPCForge** → **Document Register** to upload drawings, assign revision numbers, and route for approval.

---

## 📚 Documentation

Detailed documentation, user guide, and API reference are available on our GitHub Pages site:
👉 **[EPCForge Online Documentation Portal](https://invento-software-limited.github.io/epcforge/)**

---

## 🏢 About Publisher & Support

Developed and maintained by **Invento Software Limited**. Invento builds enterprise-grade Frappe and ERPNext applications for construction, engineering, manufacturing, and supply chain enterprises.

- 🌐 **Website**: [invento.com.bd](https://invento.com.bd)
- 📧 **Support Email**: [hello@invento.com.bd](mailto:hello@invento.com.bd)
- 🐞 **Issue Tracker**: [GitHub Issues](https://github.com/invento-software-limited/epcforge/issues)
- ⭐ **Star Us**: If you find EPCForge helpful, give us a star on GitHub!

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
