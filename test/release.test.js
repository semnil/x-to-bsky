import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WORKFLOWS = ".github/workflows";
const release = fs.readFileSync(`${WORKFLOWS}/release.yaml`, "utf8");

// Returns the text of one job, from its key line up to the next job key.
function jobIn(text, name) {
  const at = text.indexOf(`\n  ${name}:`);
  if (at === -1) return null;
  const rest = text.slice(at + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// Returns the run commands of a job's steps, skipping steps that run only on failure.
function checksOf(job) {
  return job
    .split(/\n {6}- /)
    .slice(1)
    .filter((step) => !/^\s*if: failure\(\)/m.test(step))
    .map((step) => step.match(/^\s*run: (.+)$/m))
    .filter(Boolean)
    .map((match) => match[1].trim());
}

describe("tools/check-tag.sh", () => {
  const script = "tools/check-tag.sh";
  let box;
  beforeAll(() => {
    box = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "x2b-tag-"));
  });
  afterAll(() => fs.rmSync(box, { recursive: true, force: true }));

  function ask(event, ref) {
    const out = path.join(box, "out");
    fs.writeFileSync(out, "");
    const run = spawnSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_REF_NAME: ref, GITHUB_OUTPUT: out, RUNNER_DEBUG: "" },
    });
    return { run, wrote: fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean) };
  }

  it("is run by the release workflow", () => {
    expect(release).toContain("run: bash tools/check-tag.sh");
  });

  const accepted = [
    ["push", "v1.2.3", ["validTag=true", "prerelease=false", "version=v1.2.3"]],
    ["push", "v1.2.3-rc1", ["validTag=true", "prerelease=true", "version=v1.2.3-rc1"]],
    ["push", "v1.2.3-beta2", ["validTag=true", "prerelease=true", "version=v1.2.3-beta2"]],
    ["push", "v1.2.3-alpha", ["validTag=true", "prerelease=true", "version=v1.2.3-alpha"]],
    ["workflow_dispatch", "master", ["validTag=false"]],
    ["workflow_dispatch", "v1.2.3", ["validTag=false"]],
  ];
  it.each(accepted)("%s of %s passes and writes its flags", (event, ref, wanted) => {
    const { run, wrote } = ask(event, ref);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(wrote).toEqual(wanted);
  });

  it.each([["v1.2.3.4"], ["v1.2"], ["v1.2.3-nightly"]])("a push of %s is refused and writes no flag", (ref) => {
    const { run, wrote } = ask("push", ref);
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toMatch(/::error::tag .* names no release/);
    expect(wrote).toEqual([]);
  });
});

describe("tools/verify-version.sh", () => {
  const script = "tools/verify-version.sh";
  let box;
  beforeAll(() => {
    box = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "x2b-version-"));
  });
  afterAll(() => fs.rmSync(box, { recursive: true, force: true }));

  function ask(manifest, tag) {
    const at = path.join(box, "manifest.json");
    fs.writeFileSync(at, JSON.stringify(manifest));
    return spawnSync("bash", [script, at, tag], { encoding: "utf8" });
  }

  it("is run by the release workflow", () => {
    expect(release).toContain("run: bash tools/verify-version.sh");
  });

  it.each([
    ["a release tag against a numeric version", { version: "1.2.0" }, "v1.2.0"],
    ["a prerelease tag against version_name", { version: "1.2.0", version_name: "1.2.0-rc1" }, "v1.2.0-rc1"],
    ["a release tag against a version_name equal to the version", { version: "1.0.1", version_name: "1.0.1" }, "v1.0.1"],
    ["an alpha tag on the same numbers", { version: "1.0.1", version_name: "1.0.1-alpha" }, "v1.0.1-alpha"],
    ["a beta tag on the same numbers", { version: "1.0.1", version_name: "1.0.1-beta2" }, "v1.0.1-beta2"],
    ["an rc tag on the same numbers", { version: "1.0.1", version_name: "1.0.1-rc1" }, "v1.0.1-rc1"],
  ])("%s passes", (_, manifest, tag) => {
    const run = ask(manifest, tag);
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it.each([
    ["a tag that is not the version", { version: "1.2.0" }, "v1.2.1", /does not match tag/],
    ["a release tag against a manifest showing a prerelease", { version: "1.2.0", version_name: "1.2.0-rc1" }, "v1.2.0", /does not match tag/],
    ["a name that is not built on the version", { version: "1.2.0", version_name: "9.9.9-rc1" }, "v9.9.9-rc1", /does not begin with version/],
    ["a name whose numbers only start with the version", { version: "1.0.1", version_name: "1.0.10-rc1" }, "v1.0.10-rc1", /does not begin with version/],
    ["a manifest naming no version", { name: "p" }, "v1.2.0", /names no version/],
  ])("%s is refused", (_, manifest, tag, why) => {
    const run = ask(manifest, tag);
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toMatch(why);
  });

  it("accepts this repository's manifest against its own version tag", () => {
    const { version } = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    const run = spawnSync("bash", [script, "manifest.json", `v${version}`], { encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });
});

describe("release.yaml", () => {
  it("runs every CI check in the build job before it packs", () => {
    const ci = checksOf(jobIn(fs.readFileSync(`${WORKFLOWS}/ci.yaml`, "utf8"), "test"));
    const build = jobIn(release, "build");
    expect(ci).toContain("npm test");
    const packs = build.indexOf("- name: Pack Extension");
    expect(packs).toBeGreaterThan(-1);
    expect(build).toContain("bash build.sh");
    for (const check of ci) {
      const at = build.indexOf(`run: ${check}`);
      expect(at, `the release build runs ${check}`).toBeGreaterThan(-1);
      expect(at, `the release build runs ${check} before it packs`).toBeLessThan(packs);
    }
  });

  it("records the name and sha256 of the one archive it packed", () => {
    const build = jobIn(release, "build");
    expect(build).toContain("archive=${built[0]}");
    expect(build).toContain("sha256sum");
    expect(build).toMatch(/packing left \$\{#built\[@\]\} archives/);
    expect(build).toMatch(/outputs:[\s\S]*?archive:[\s\S]*?digest:/);
  });

  it("compares the download with the record before it makes a release", () => {
    const job = jobIn(release, "release");
    expect(job).toContain("needs.build.outputs.archive");
    expect(job).toContain("needs.build.outputs.digest");
    const compares = job.indexOf('PACKED_DIGEST}" ]]; then');
    const releases = job.indexOf("- name: Create Release");
    expect(compares).toBeGreaterThan(-1);
    expect(releases).toBeGreaterThan(-1);
    expect(compares).toBeLessThan(releases);
  });

  it("runs the release job on every run and gates only the step that makes the release", () => {
    const job = jobIn(release, "release");
    const header = job.slice(0, job.indexOf("\n    steps:"));
    expect(header).not.toContain("validTag");
    const steps = job.slice(job.indexOf("\n    steps:")).split(/\n {6}- (?=name:|uses:)/).slice(1);
    const makesRelease = steps.filter((step) => step.includes("action-gh-release"));
    expect(makesRelease).toHaveLength(1);
    expect(makesRelease[0]).toContain("if: needs.check-event.outputs.validTag == 'true'");
    expect(steps.filter((step) => step.includes("validTag"))).toHaveLength(1);
  });

  it("checks the version only where a release is made", () => {
    const gate = "if: needs.check-event.outputs.validTag == 'true'";
    expect(release.split("\n").filter((line) => line.trim() === gate)).toHaveLength(2);
    const verify = release.indexOf("run: bash tools/verify-version.sh");
    expect(verify).toBeGreaterThan(-1);
    expect(release.lastIndexOf(gate, verify)).toBeGreaterThan(release.lastIndexOf("- name:", verify));
  });

  it("puts a timeout on every job", () => {
    const jobs = release.slice(release.indexOf("\njobs:")).match(/\n {2}[\w-]+:/g).map((key) => key.trim().slice(0, -1));
    expect(jobs).toEqual(["check-event", "build", "release"]);
    for (const name of jobs) {
      expect(jobIn(release, name), name).toMatch(/\n {4}timeout-minutes: \d+/);
    }
  });
});
