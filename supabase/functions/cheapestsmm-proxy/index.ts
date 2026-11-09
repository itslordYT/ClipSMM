// SMM Panel API proxy edge function
// Reads the provider's API key and API URL from the database (set via the Providers page).
// Supports any SMM panel that uses the standard SMM panel API format (action-based, form-encoded POST).
// Supported actions: services, balance, add, status, refill, refill_status, cancel

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_API_URL = "https://cheapestsmmpanels.com/api/v2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action as string;
    const providerId = body.provider_id as string | undefined;

    const allowedActions = [
      "services",
      "balance",
      "add",
      "status",
      "refill",
      "refill_status",
      "cancel",
    ];

    if (!action || !allowedActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!providerId) {
      return new Response(
        JSON.stringify({ error: "provider_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Read the API key from the encrypted storage function
    const { data: keyData, error: keyError } = await supabase
      .rpc("get_provider_api_key", { p_provider_id: providerId });

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ error: "No API key set for this provider. Add your SMM panel API key in the provider settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = keyData as string;

    // Read the provider's custom API URL, fall back to the default
    const { data: providerData } = await supabase
      .from("providers")
      .select("api_url")
      .eq("id", providerId)
      .maybeSingle();

    const apiUrl = (providerData?.api_url as string) || DEFAULT_API_URL;

    // Build form data for the provider API
    const formData = new URLSearchParams();
    formData.append("key", apiKey);
    formData.append("action", action);

    // Forward action-specific parameters
    const forwardKeys: Record<string, string[]> = {
      services: [],
      balance: [],
      add: ["service", "link", "quantity"],
      status: ["order"],
      refill: ["order"],
      refill_status: ["refill"],
      cancel: ["order"],
    };

    const keys = forwardKeys[action] ?? [];
    for (const key of keys) {
      if (body[key] !== undefined && body[key] !== null) {
        formData.append(key, String(body[key]));
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const msg = fetchErr instanceof Error && fetchErr.name === "AbortError"
        ? "Provider API timed out after 15 seconds"
        : (fetchErr instanceof Error ? fetchErr.message : "Network error reaching provider API");
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeoutId);

    const responseText = await response.text();

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    // Check for provider-level error patterns
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.error) {
        return new Response(
          JSON.stringify({ error: String(obj.error) }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
