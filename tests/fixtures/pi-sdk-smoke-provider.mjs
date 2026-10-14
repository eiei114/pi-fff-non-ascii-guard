import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

const provider = fauxProvider({
  api: "dotguard-smoke",
  provider: "dotguard-smoke",
  models: [{
    id: "deterministic",
    name: "Deterministic offline smoke model",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 256,
  }],
  tokensPerSecond: 0,
});

provider.setResponses([
  (context) => {
    const latestUserMessage = [...context.messages].reverse().find((message) => message.role === "user");
    const prompt = typeof latestUserMessage?.content === "string"
      ? latestUserMessage.content
      : latestUserMessage?.content?.map((item) => item.type === "text" ? item.text : "").join("\n") ?? "";

    if (prompt === "dotguard-smoke:list") {
      return fauxAssistantMessage(fauxToolCall("list_non_ascii_paths", {}), { stopReason: "toolUse" });
    }
    if (prompt === "dotguard-smoke:gate") {
      return fauxAssistantMessage(fauxToolCall("grep", { pattern: "smoke-probe", path: "." }), { stopReason: "toolUse" });
    }
    return fauxAssistantMessage(fauxText("Unexpected smoke prompt"));
  },
  fauxAssistantMessage(fauxText("Pi SDK smoke feature call completed")),
]);

export default function (pi) {
  pi.registerProvider(provider.provider);
}
