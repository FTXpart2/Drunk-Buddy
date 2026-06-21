import { log } from "../log";

// Arize / OpenInference tracing — PURELY PASSIVE observability. It streams a span
// per agent turn, per Claude call, and per tool call to a dashboard so you can see
// every request. It has ZERO effect on behavior: a complete no-op unless ARIZE_API_KEY
// (Arize AX) or PHOENIX_COLLECTOR_ENDPOINT (self-hosted Phoenix) is set, and every
// span is best-effort — a tracing error can never touch the agent or a reply.

let tracer: any = null;

export async function initTracing(): Promise<void> {
  const arizeKey = process.env.ARIZE_API_KEY;
  const arizeSpace = process.env.ARIZE_SPACE_ID;
  const phoenix = process.env.PHOENIX_COLLECTOR_ENDPOINT; // e.g. http://localhost:6006/v1/traces
  if (!arizeKey && !phoenix) return; // not configured -> no tracing at all, zero overhead

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-proto");
    const otel = await import("@opentelemetry/api");

    const exporter = arizeKey
      ? new OTLPTraceExporter({
          url: process.env.ARIZE_OTLP_URL || "https://otlp.arize.com/v1/traces",
          headers: { api_key: arizeKey, space_id: arizeSpace ?? "" },
        })
      : new OTLPTraceExporter({ url: phoenix! });

    const sdk = new NodeSDK({ serviceName: "drunk-buddy", traceExporter: exporter });
    sdk.start();
    tracer = otel.trace.getTracer("drunk-buddy");
    log("arize.tracing", { sink: arizeKey ? "arize-ax" : "phoenix" });
  } catch (err) {
    log("arize.init_failed", { err: String(err) });
    tracer = null;
  }
}

// Wrap an operation in an OpenInference span. When tracing is off this just runs
// fn() with no overhead. `kind` ("LLM" | "TOOL" | "CHAIN" | "AGENT") tells Arize
// how to render the span.
export async function span<T>(
  name: string,
  kind: "LLM" | "TOOL" | "CHAIN" | "AGENT",
  attrs: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tracer) return fn();
  return tracer.startActiveSpan(name, async (s: any) => {
    try {
      s.setAttribute("openinference.span.kind", kind);
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        s.setAttribute(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      const out = await fn();
      try {
        if (typeof out === "string") s.setAttribute("output.value", out.slice(0, 2000));
      } catch {
        /* ignore */
      }
      s.setStatus({ code: 1 }); // OK
      return out;
    } catch (e) {
      try {
        s.recordException(e);
        s.setStatus({ code: 2, message: String(e) }); // ERROR
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      try {
        s.end();
      } catch {
        /* ignore */
      }
    }
  });
}
