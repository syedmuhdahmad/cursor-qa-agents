# QA manual for .NET

**Status: not supported yet.** The kit has no skill, hook rule, or verdict line for .NET today. .NET support is planned for v0.4.0, with a planned finish on Saturday 6 February 2027. v0.4.0 comes after v0.3.0, the `npx qa-agent-kit` installer, planned for 2 January 2027. Dates move when a sprint is lost. [docs/roadmap.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/roadmap.md) has the current plan, and [[Roadmap and open issues]] says where the work is tracked.

This page says what is planned, and what a QA engineer can do by hand until then.

## What happens if you install the kit today

| In your repository | What happens |
| --- | --- |
| A .NET project with no `package.json` | Do not install the kit. Its skills write TypeScript tests, and the hook denies the agent every program that is not on its list. `dotnet` is not on it. |
| A .NET backend with a React or Next.js front end in its own package | Install the kit into the front-end package and open that folder in Cursor, as for a monorepo. The [[QA manual for web apps]] then applies. End-to-end specs can test the whole app when it runs on this machine: start it yourself and give the agent its address, such as `Base URL http://localhost:5000`. |

## What is planned

The design is in [the multi-tool design spec](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/superpowers/specs/2026-10-26-multi-tool-qa-agent-design.md). Everything in this section is planned and can change.

### The tools

| Layer | Planned packages |
| --- | --- |
| Unit | `xunit.v3`, `NSubstitute`, `Shouldly` |
| Integration | `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory`) and Testcontainers for .NET, with the PostgreSQL, SQL Server, or Redis module as needed |
| End to end | `Microsoft.Playwright` with an xUnit v3 base class |
| Coverage | `coverlet.collector` |

All are open source. Shouldly was chosen over FluentAssertions because FluentAssertions 8 needs a paid licence for commercial use. Integration tests are to run against a real database in a container and the real HTTP pipeline, with no mocks at the edges.

Whether Playwright for .NET has a package with an xUnit v3 base class is an open question. A spike decides it before any .NET skill is written.

### The jobs

| Planned job | What it is to do | Tracked as |
| --- | --- | --- |
| `/qa-dotnet-unit` | Write or fix one xUnit v3 unit test | SCRUM-44 |
| `/qa-dotnet-integration` | Write or fix one integration test with `WebApplicationFactory` and Testcontainers | SCRUM-45 |
| `/qa-plan`, `/qa-generate`, `/qa-heal` | The web jobs, writing C# with Playwright for .NET in a .NET project | SCRUM-46 |

The rule stays the same as on the other stacks: the agent writes tests, never edits application source, and reports a product bug instead of weakening a test.

### The verdict line

`dotnet test --logger trx` writes a TRX file. A Node script is to read it and print one line, `QA-VERDICT: PASS` or `QA-VERDICT: FAIL (<n> failed, <n> skipped)`. A run with zero tests is a failure, as on the other stacks.

### The hook

The guard hook is to be rewritten in Node, with a list of shell commands for each stack. For .NET the list is `dotnet test`, `dotnet build`, and the Playwright install script `pwsh bin/.../playwright.ps1`. A write that adds `[Fact(Skip = ...)]` is to be denied, as `.skip` is in a TypeScript test.

### Install

v0.3.0 is to install the kit with one command into Claude Code and Cursor. It is to detect a .NET app from a `*.csproj` or `*.sln` file and ask which stack to set up:

```bash
npx qa-agent-kit
npx qa-agent-kit --yes --tools claude,cursor --stack dotnet
```

The installer is to ask where the agent may write tests, with `test/` as the detected default. The design does not fix the .NET folder layout yet.

## Until then: by hand

You can use the same open-source tools today, without the agent. The commands below are plain .NET commands. They are not part of the kit and were not run by its maintainers. `MyApp.Tests` stands for your test project.

### A test project

Create an xUnit v3 test project from the xUnit templates, and add the packages:

```bash
dotnet new install xunit.v3.templates
dotnet new xunit3 -o MyApp.Tests
dotnet add MyApp.Tests package NSubstitute
dotnet add MyApp.Tests package Shouldly
dotnet add MyApp.Tests package Microsoft.AspNetCore.Mvc.Testing
dotnet add MyApp.Tests package Testcontainers.PostgreSql
dotnet add MyApp.Tests package Microsoft.Playwright
dotnet add MyApp.Tests package coverlet.collector
```

Pick the Testcontainers module for your database: `Testcontainers.PostgreSql`, `Testcontainers.MsSql`, or `Testcontainers.Redis`. Testcontainers needs Docker on the machine that runs the tests.

### Run the tests

```bash
dotnet test
dotnet test --filter "FullyQualifiedName~Profile"
dotnet test --logger trx
dotnet test --collect:"XPlat Code Coverage"
```

The `--logger trx` run writes a TRX file under `TestResults/`. The coverage run writes a Cobertura file there too.

Playwright for .NET needs its browsers. After a build, run the script it puts in the output folder, with your target framework in the path:

```bash
dotnet build MyApp.Tests
pwsh MyApp.Tests/bin/Debug/<framework>/playwright.ps1 install chromium
```

### Keep the kit's rules by hand

The kit's rules work without the kit:

- A run with no tests is a failure, and so is a skipped test. Do not merge a `[Fact(Skip = ...)]` without a bug ticket.
- When a test fails because the product is wrong, file the bug and leave the test's expected value as it is.
- Fix a failing test with the smallest change: no longer timeouts, no retries, no check removed.
- Test against a database in a container, not against a shared one.

When v0.4.0 ships, this page will become the full manual, in the form of the [[QA manual for web apps]] and the [[QA manual for React Native]].
