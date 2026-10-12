import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { OtlpSerialization, OtlpTracer } from "effect/observability";

const tracing = OtlpTracer.layerFromConfig({
  resource: { serviceName: "oxlint-plugin-decision" },
}).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));

const workerServices: [typeof NodeServices.layer, typeof tracing] = [NodeServices.layer, tracing];

export { workerServices };
