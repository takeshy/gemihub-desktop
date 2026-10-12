/** A definitive MCP rejection, distinct from an ambiguous transport failure. */
export class KakerattaRejectedError extends Error {
  readonly requestUnavailable: boolean;
  constructor(details = "") {
    super("Kakeratta rejected the request");
    this.requestUnavailable = /依頼が見つかりません|別の claimId|claimId が一致しません/.test(details);
  }
}
