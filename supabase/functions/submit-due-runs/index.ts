// Server-side scheduler: submits due campaign run items to the provider.
// Called by a cron or manually — works even when no browser is open.
// Processes runs in organic priority order: views → likes → comments → shares → reposts → saves → followers → subscribers.
// Uses each provider's own api_url from the database — not a hardcoded URL.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_API_URL = "https://cheapestsmmpanels.com/api/v2";

const METRIC_PRIORITY: Record<string, number> = {
  views: 1,
  likes: 2,
  comments: 3,
  shares: 4,
  reposts: 5,
  saves: 6,
  followers: 7,
  subscribers: 8,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date().toISOString();

    // Find all due run items that haven't been submitted yet
    const { data: dueRuns, error: fetchError } = await supabase
      .from("campaign_run_items")
      .select(`
        id,
        campaign_id,
        campaign_metric_id,
        run_number,
        planned_quantity,
        charge_paise,
        currency,
        planned_at,
        status,
        provider_order_id,
        campaign_metrics (
          id,
          metric,
          service_id,
          target_link
        )
      `)
      .in("status", ["SCHEDULED", "WAITING", "FAILED"])
      .is("provider_order_id", null)
      .lte("planned_at", now)
      .order("planned_at", { ascending: true });

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch due runs", detail: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!dueRuns || dueRuns.length === 0) {
      return new Response(
        JSON.stringify({ submitted: 0, failed: 0, message: "No due runs pending" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sort by metric priority then planned_at
    const sorted = (dueRuns as Record<string, unknown>[]).sort((a, b) => {
      const metricA = (a.campaign_metrics ?? {}) as Record<string, unknown>;
      const metricB = (b.campaign_metrics ?? {}) as Record<string, unknown>;
      const priA = METRIC_PRIORITY[String(metricA.metric)] ?? 99;
      const priB = METRIC_PRIORITY[String(metricB.metric)] ?? 99;
      if (priA !== priB) return priA - priB;
      return new Date(String(a.planned_at)).getTime() - new Date(String(b.planned_at)).getTime();
    });

    let submitted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const run of sorted) {
      const metricRow = (run.campaign_metrics ?? {}) as Record<string, unknown>;
      const metricId = String(metricRow.id);
      const metricName = String(metricRow.metric);
      const serviceId = String(metricRow.service_id ?? "");
      const targetLink = String(metricRow.target_link ?? "");

      if (!serviceId || !targetLink) {
        await supabase.from("campaign_run_items").update({
          status: "FAILED",
          error_message: "Missing service or target link",
          updated_at: now,
        }).eq("id", run.id);
        failed++;
        errors.push(`${metricName} run ${run.run_number}: missing service or link`);
        continue;
      }

      // Atomically claim the run by setting status to PROCESSING
      const { data: claimed, error: claimError } = await supabase
        .from("campaign_run_items")
        .update({ status: "PROCESSING", updated_at: now })
        .eq("id", run.id)
        .in("status", ["SCHEDULED", "WAITING", "FAILED"])
        .is("provider_order_id", null)
        .select()
        .maybeSingle();

      if (claimError || !claimed) {
        continue; // Already claimed by another process
      }

      // Fetch the service and provider (including api_url)
      const { data: service } = await supabase
        .from("provider_services")
        .select("*, providers!inner(id, name, kind, currency, balance_paise, slug, api_url)")
        .eq("id", serviceId)
        .maybeSingle();

      if (!service) {
        await supabase.from("campaign_run_items").update({
          status: "FAILED",
          error_message: "Service not found",
          updated_at: now,
        }).eq("id", run.id);
        failed++;
        errors.push(`${metricName} run ${run.run_number}: service not found`);
        continue;
      }

      const provider = (service as Record<string, unknown>).providers as Record<string, unknown>;
      const providerKind = String(provider?.kind ?? "mock");
      const externalServiceId = String((service as Record<string, unknown>).external_service_id ?? "");
      const quantity = Number(run.planned_quantity);

      let externalOrderId: string | null = null;
      let chargePaise: number | null = null;
      let startCount: number | null = null;
      let currency = String(provider?.currency ?? "INR");
      let submitError: string | null = null;

      if (providerKind === "mock") {
        externalOrderId = `mock-${Date.now()}`;
        chargePaise = Math.round((Number((service as Record<string, unknown>).rate_paise_per_1000) * quantity) / 1000);
        startCount = 0;
        currency = "INR";
      } else {
        // Get provider API key
        const { data: apiKey } = await supabase
          .rpc("get_provider_api_key", { p_provider_id: String(provider.id) });

        if (!apiKey) {
          submitError = "No API key set for this provider";
        } else if (!externalServiceId) {
          submitError = "Service has no external service ID";
        } else {
          // Use the provider's custom API URL, fall back to default
          const apiUrl = String(provider?.api_url ?? "") || DEFAULT_API_URL;

          const formData = new URLSearchParams();
          formData.append("key", String(apiKey));
          formData.append("action", "add");
          formData.append("service", externalServiceId);
          formData.append("link", targetLink);
          formData.append("quantity", String(quantity));

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          let res: Response;
          try {
            res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: formData.toString(),
              signal: controller.signal,
            });
          } catch (fetchErr) {
            clearTimeout(timeoutId);
            submitError = fetchErr instanceof Error && fetchErr.name === "AbortError"
              ? "Provider API timed out after 15 seconds"
              : (fetchErr instanceof Error ? fetchErr.message : "Network error reaching provider API");
            continue;
          }
          clearTimeout(timeoutId);

          const resText = await res.text();
          let resData: Record<string, unknown>;
          try {
            resData = JSON.parse(resText);
          } catch {
            resData = { raw: resText };
          }

          if (resData.error) {
            submitError = String(resData.error);
          } else {
            externalOrderId = String(resData.order ?? "");
            const chargeRaw = parseFloat(String(resData.charge ?? "0"));
            chargePaise = isNaN(chargeRaw) ? null : Math.round(chargeRaw * 100);
            startCount = parseInt(String(resData.start_count ?? "0"), 10);
            if (isNaN(startCount)) startCount = null;
            if (!externalOrderId) {
              submitError = "Provider did not return an order ID";
            }
          }
        }
      }

      if (submitError || !externalOrderId) {
        await supabase.from("campaign_run_items").update({
          status: "FAILED",
          error_message: submitError ?? "Unknown error",
          updated_at: now,
        }).eq("id", run.id);
        failed++;
        errors.push(`${metricName} run ${run.run_number}: ${submitError ?? "Unknown error"}`);
        continue;
      }

      // Update run item as submitted
      await supabase.from("campaign_run_items").update({
        status: "SUBMITTED",
        provider_order_id: externalOrderId,
        charge_paise: chargePaise ?? Number(run.charge_paise),
        currency,
        start_count: startCount,
        submitted_at: now,
        editable: false,
        error_message: null,
        updated_at: now,
      }).eq("id", run.id);

      // Record provider order
      await supabase.from("provider_orders").insert({
        campaign_id: run.campaign_id,
        run_id: null,
        metric_id: metricId,
        provider_id: provider.id,
        service_id: serviceId,
        external_order_id: externalOrderId,
        quantity,
        charge_paise: chargePaise ?? Number(run.charge_paise),
        status: "SUBMITTED",
        response_data: { order: externalOrderId, charge: chargePaise },
        currency,
        delivered_quantity: 0,
        start_count: startCount,
        provider_status: "Pending",
        balance_before_paise: provider ? Number(provider.balance_paise) : null,
        balance_after_paise: null,
      });

      // Update campaign status
      await supabase.from("campaigns").update({
        status: "PROCESSING",
        updated_at: now,
      }).eq("id", run.campaign_id);

      submitted++;
    }

    return new Response(
      JSON.stringify({ submitted, failed, errors: errors.slice(0, 10), total: sorted.length }),
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
