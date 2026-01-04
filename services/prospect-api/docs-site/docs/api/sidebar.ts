import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api/prospect-pipeline-api",
    },
    {
      type: "category",
      label: "Health",
      items: [
        {
          type: "doc",
          id: "api/health-check",
          label: "Health check",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Prospects",
      items: [
        {
          type: "doc",
          id: "api/list-prospects",
          label: "List prospects",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-list-options",
          label: "Get list options",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Enrichment",
      items: [
        {
          type: "doc",
          id: "api/enqueue-enrichment",
          label: "Enqueue prospects for enrichment",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/tag-outreach-ready",
          label: "Tag prospects as outreach ready",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Pricing",
      items: [
        {
          type: "doc",
          id: "api/start-pricing-session",
          label: "Start pricing session",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/get-current-session",
          label: "Get current pricing session",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-session-total",
          label: "Get session total",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/reset-pricing-session",
          label: "Reset pricing session",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/admin-reset-session",
          label: "Admin reset pricing session",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/estimate-cost",
          label: "Estimate enrichment cost",
          className: "api-method post",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
