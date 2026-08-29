# AutoDrive source audit

Date: 2026-08-30

## Accepted primary-source evidence

- SWE-EVO paper: `https://arxiv.org/abs/2512.18470`
- SWE-EVO repository: `https://github.com/SWE-EVO/SWE-EVO`
- Pinned upstream commit: `9b83d5af943ba7a17567336f5b18239f73960219`
- Pinned Arrow SHA-256: `74e7c63160ada4ceba71d5d89a9bb7c9794f4574b384458d546eb65cdb730520`
- OpenAI SWE-Bench Pro audit: `https://openai.com/index/separating-signal-from-noise-coding-evaluations/`
- Related-work records are resolved to their primary paper or publisher pages in `paper/references.bib`.

The exact task manifest was generated from the digest-pinned Arrow artifact, not copied from a mutable web viewer. It contains 48 tasks from seven repositories: Conan (2), Dask (8), DVC (26), Modin (3), Requests (4), Pydantic (3), and scikit-learn (2).

## Deep-research cross-check

Research interaction `v1_ChdOUkNUYXRIUExmM2xqTWNQck16RHVBYxIXTlJDVGF0SFBMZjNsak1jUHJNekR1QWM` completed and was used only as a discovery and contradiction check. Its claims that the exact SWE-EVO manifest was unavailable and that the corpus included Django or NumPy conflict with the pinned Arrow artifact. Those claims were discarded and are not used in the manuscript. No numerical or novelty claim from that report was accepted without independent primary-source verification.

## Claim boundary

The manuscript does not claim invention of supervisors, agent memory, termination, abstention, or loop prevention. Its bounded claim is the integration of turn-boundary tri-state continuation control with durable Session admission, user-priority scheduling, and decision-to-admission recovery for a coding-agent runtime. Empirical utility remains explicitly pending until paid trajectories and independent labels pass the frozen gates.
