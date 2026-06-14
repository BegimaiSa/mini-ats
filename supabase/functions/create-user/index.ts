import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AccountRole = "admin" | "customer";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  const currentRole = normalizeRole(
    user.app_metadata?.role ?? user.user_metadata?.role,
  );
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .or(`id.eq.${user.id},user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();
  const profileRole = normalizeRole(profile?.role);

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 400);
  }

  if (currentRole !== "admin" && profileRole !== "admin") {
    return jsonResponse({ error: "Only admins can create accounts." }, 403);
  }

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = body.role as AccountRole;

  if (!email || password.length < 6 || !["admin", "customer"].includes(role)) {
    return jsonResponse({ error: "Invalid account data." }, 400);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role,
    },
    user_metadata: {
      role,
    },
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const { error: profileUpsertError } = await adminClient
    .from("profiles")
    .upsert(
      {
        id: data.user.id,
        user_id: data.user.id,
        email,
        role,
      },
      { onConflict: "id" },
    );

  if (profileUpsertError) {
    return jsonResponse({ error: profileUpsertError.message }, 400);
  }

  return jsonResponse({
    id: data.user.id,
    email: data.user.email,
    role,
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeRole(role: unknown): AccountRole {
  return String(role ?? "").trim().toLowerCase() === "admin"
    ? "admin"
    : "customer";
}
