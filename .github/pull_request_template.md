## 📝 Summary

**What’s changing and why?**  
(Explain the purpose of this PR. Be specific — help reviewers understand the context.)

Please include:
- What problem is being solved?
- Motivation behind the change?
- Are you fixing a bug, adding a feature, refactoring?
- Why is this the chosen approach?

---

## ✅ What Was Done

- [ ] Code changes (feature, fix, refactor, etc.)
- [ ] UI changes (include screenshots if relevant)
- [ ] Documentation updates
  - [ ] Code comments
  - [ ] README / Wiki
  - [ ] API Docs / Swagger / Postman
- [ ] Infrastructure Changes (Terraform)
- [ ] Data Migration Script

---

## 🛠️ Configuration Changes

**Are config/environment changes required?**
- [ ] No configuration changes
- [ ] Yes — details below:

**Responsibility:**  
- [ ] I am responsible and I have already made the configuration changes everywhere (Dev/Staging/Production)
- [ ] Reviewer is responsible and has changes to make

**Changes need to be made in:**  
- [ ] GitHub repo settings or secrets  
- [ ] Azure Key Vault  
- [ ] Terraform  
- [ ] Octopus Deploy  
- [ ] Other (please specify): `_________________________`

> Example: New API key added to Key Vault and referenced in Terraform output for staging & production.

---

## 🔍 How It Was Tested

**Manual Testing:**
(What was manually tested? Include tools, devices, and scenarios.)

**Automated Testing:**
- [ ] Unit tests added/updated
- [ ] Integration/E2E tests added/updated

---

## ⚠️ Risks & Notes

**Any risks, side effects, or special notes for reviewers?**

> Example: Refactored shared validation logic — could impact other forms. Please test login, registration, and profile updates.

---

## 🔗 Related Work

Link any:
- Related GitHub Pull Requests: #123
- Docs or diagrams: Link here

---

## 📋 Ready for Review Checklist

- [ ] I have confirmed that this meets all the requirements on the JIRA work item
- [ ] **Sign off user has approved**
- [ ] **Demo to the Sign off user**
- [ ] Configuration changes are documented/applied
- [ ] No secrets, passwords, or sensitive data committed
- [ ] Data Migration tasks have been created as JIRA tickets or already completed
