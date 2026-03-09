import { describe, test, expect } from "bun:test";
import { generateApiSig } from "../src/lastfm";

describe("generateApiSig", () => {
  test("generates correct MD5 signature", () => {
    // Example from Last.fm docs
    const params = {
      method: "auth.getSession",
      api_key: "YOUR_API_KEY",
      token: "YOUR_REQUESTED_TOKEN",
    };
    const secret = "YOUR_SECRET";

    const sig = generateApiSig(params, secret);

    // The expected result: sorted keys are api_key, method, token
    // String: "api_keyYOUR_API_KEYmethodauth.getSessiontokenYOUR_REQUESTED_TOKENYOUR_SECRET"
    // MD5 of that string
    expect(sig).toBe("94539006de89b3c6b3c030bb1e52b9c4");
  });

  test("excludes 'format' parameter from signature", () => {
    const params = {
      method: "auth.getSession",
      api_key: "KEY",
      token: "TOKEN",
      format: "json",
    };
    const secret = "SECRET";

    const withFormat = generateApiSig(params, secret);

    const paramsNoFormat = {
      method: "auth.getSession",
      api_key: "KEY",
      token: "TOKEN",
    };

    const withoutFormat = generateApiSig(paramsNoFormat, secret);

    expect(withFormat).toBe(withoutFormat);
  });

  test("sorts parameters alphabetically", () => {
    const params1 = {
      z_param: "z",
      a_param: "a",
      m_param: "m",
    };
    const params2 = {
      a_param: "a",
      m_param: "m",
      z_param: "z",
    };
    const secret = "SECRET";

    expect(generateApiSig(params1, secret)).toBe(
      generateApiSig(params2, secret)
    );
  });
});
