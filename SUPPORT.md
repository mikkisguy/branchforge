# Support

## Getting Help

There are several ways to get help with BranchForge:

### Documentation

First, check the documentation:

- [README.md](README.md) - Quick start guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md) - What's being built
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [DATABASE_SCHEMAS.md](docs/DATABASE_SCHEMAS.md) - Database structure

### Search Existing Resources

Before asking for help, please search [existing issues](https://github.com/mikkisguy/branchforge/issues) (Better documentation/wiki is planned)

### Report a Bug

Found a bug? Open an issue with the [bug report template](https://github.com/mikkisguy/branchforge/issues/new?template=bug_report.md).
Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, Node.js version)
- Screenshots if applicable
- Error logs

### Request a Feature

Have an idea? Open an issue with the [feature request template](https://github.com/mikkisguy/branchforge/issues/new?template=feature_request.md).
Check the [FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md) first to see if it's already planned.

### Email Support

For security issues, see [SECURITY.md](SECURITY.md) for private reporting.

General questions are best handled via GitHub issues.

## FAQ

### Common Questions

#### Is BranchForge stable enough for my project?

**No.** BranchForge is currently in **alpha**. It's a work-in-progress with incomplete features and potential bugs. Back up your work frequently. Use it for experimentation and feedback only.

#### How do I export my project?

Use GitLab export (`/api/projects/:id/gitlab/export`) or wait for zip export (planned).

#### Can I collaborate with other writers?

Project sharing is planned. Currently, GitLab provides version control.

#### How do I backup my data?

Use PostgreSQL backups or rely on GitLab as version control.

#### Is BranchForge free?

Yes! It's open source (GPL v3).

### Troubleshooting

#### Issue: "Database connection failed"

- Check PostgreSQL is running
- Verify `DATABASE_URL` in `.env`
- Ensure user has permissions

#### Issue: "GitLab sync fails"

- Verify PAT has correct permissions (read_api, read_repository)
- Check repository URL is correct
- Test connection in GitLab settings

#### Issue: "Session expired"

- Check `SESSION_SECRET` is set
- Verify `SESSION_MAX_AGE` (default: 24 hours; must be within 1h–30d). Note: sliding expiry is enabled, so this is an inactivity timeout — users active within the window stay logged in
- Clear browser cookies

#### Issue: "Avatar upload failed"

- Check file size (max 500KB)
- Verify file type (PNG, JPEG, WebP, GIF)
- Check `uploads/` directory permissions

## Contributing

Want to help build BranchForge? See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Code guidelines
- Pull request process
- Feature priorities

## Stay Updated

- **Star the repo** ⭐ - Shows interest
- **Watch releases** - Get notified of updates
- **Follow the author** - See activity

---

Thank you for using BranchForge! Happy writing! ✨
