# MyTradingBox Documentation

This directory contains user workflows, page behavior, route permissions, development guidance, and deployment references.

## User and Support Guides

- [User Manual](USER_MANUAL.md) - Current user workflows and troubleshooting
- [Page Documentation](components/README.md) - Detailed guide for every routed page and shared surface
- [Routes and Permissions](ROUTES_AND_PERMISSIONS.md) - Route, guard, role, redirect, and parameter matrix
- [Documentation Status](DOCUMENTATION_STATUS.md) - Experimental, placeholder, and unresolved behavior

## Application Reference

- [How It Works](HOW_IT_WORKS.md) - Architecture and data-flow overview
- [Rules](RULES.md) - Application and development rules
- [Release Notes](../CHANGELOG.md) - Project change history

## Operations and Deployment

- [Deployment](DEPLOYMENT.md) - Build and deployment procedures
- [Complete Setup Guide](COMPLETE_SETUP_GUIDE.md) - Environment setup
- [Capacitor iOS Setup](CAPACITOR_IOS_SETUP.md) - Native iOS packaging
- [VAPID Key Setup](VAPID_KEY_SETUP.md) - Push notification configuration
- [Audit Index](AUDIT_INDEX.md) - Audit documentation index

## Technical References

- [Coordinate System](COORDINATE_SYSTEM.md) - Chart coordinate implementation
- [Coordinate System Complete](COORDINATE_SYSTEM_COMPLETE.md) - Extended coordinate reference
- [Architecture Diagrams](ARCHITECTURE_DIAGRAMS.md) - System diagrams
- [Terminal Commands](TERMINAL_COMMANDS.md) - Common project commands

## Documentation Maintenance

Page documentation should describe current visible behavior and should include purpose, access requirements, functions, workflows, loading/empty/error states, exceptions, limitations, and implementation references. Update the route matrix and status ledger whenever routes or permissions change.

Page documentation is enforced by `.github/instructions/page-documentation.instructions.md` for Copilot tasks and by `npm run docs:check` in CI. Page-related source changes must include a documentation change in the same diff.

Verification date: 2026-09-11.
