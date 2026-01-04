import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api/linkedin-enrichment-service-api",
    },
    {
      type: "category",
      label: "Health",
      items: [
        {
          type: "doc",
          id: "api/get-service-info",
          label: "Get service metadata",
          className: "api-method get",
        },
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
      label: "Enrichment",
      items: [
        {
          type: "doc",
          id: "api/enrich-prospect",
          label: "Enrich single prospect",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/enrich-batch",
          label: "Enrich multiple prospects",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/enrich-direct",
          label: "Enrich prospect data directly",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api/test-keywords",
          label: "Test keyword generation",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Discovery",
      items: [
        {
          type: "doc",
          id: "api/discover-prospects",
          label: "Discover new prospects",
          className: "api-method post",
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
          id: "api/get-prospect",
          label: "Get prospect by ID",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Batches",
      items: [
        {
          type: "doc",
          id: "api/list-batches",
          label: "List batches",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-batch",
          label: "Get batch by ID",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api/get-batch-prospects",
          label: "Get prospects in batch",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
