# Demand report: owner setup

These are the parts of the weekly demand report (`npm run demand:report`,
`.github/workflows/demand-report.yml`) that only the owner can do. None of
these values should ever be pasted into a chat, a commit or a log.

## Part A: Search Console service account

You need a Google account with **Owner** access to the
`curioword.com` Domain property in Search Console.

### Before you start

- The GitHub CLI must be installed and signed in. Run `gh auth status`, and run `gh auth login` if it isn't.
- If `gh` isn't available, the web-UI route in step 7 works instead.

1. **Create a Google Cloud project.** Go to
   <https://console.cloud.google.com/projectcreate>, name it
   `curio-reports`, and create it. You don't need a billing account.
2. **Enable the API.** With that project selected, open
   <https://console.cloud.google.com/apis/library/searchconsole.googleapis.com>
   and click **Enable**.
3. **Create the service account.** Go to **IAM & Admin → Service Accounts**
   (<https://console.cloud.google.com/iam-admin/serviceaccounts>), then click
   **Create service account**:
   - Name it `curio-demand-report`.
   - Click **Create and continue**.
   - **Skip** the "Grant this service account access to project" step. It
     needs no Cloud roles.
   - Click **Done**.
4. **Create a key.** Open the new service account, go to the **Keys** tab,
   and click **Add key → Create new key → JSON → Create**. A `.json` file
   downloads.
   - If you see "Service account key creation is disabled", an organisation
     policy is blocking it. Stop there and tell Claude.
   - Leave the file in Downloads (or any folder outside the `curio-web`
     checkout). It must never go inside the repo folder, because `.gitignore`
     doesn't ignore `.json` files.
5. **Copy the service account's email.** It looks like
   `curio-demand-report@curio-reports-XXXXXX.iam.gserviceaccount.com` and is
   shown on its details page.
6. **Add it to Search Console.** Open <https://search.google.com/search-console>
   and select the `curioword.com` Domain property. Then go to **Settings →
   Users and permissions → Add user**:
   - Paste the email.
   - Set **Permission: Restricted**. That's read-only, and enough for this
     report.
   - Click **Add**.
7. **Store the key in GitHub.** In PowerShell, from the folder holding the
   downloaded file, run this. It base64-encodes the file and pipes it
   straight into the secret, so it never appears on screen:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\<downloaded-file>.json")) | gh secret set GSC_SERVICE_ACCOUNT_KEY --repo SamxJames/curio-web
   ```

   (Or go to GitHub → `curio-web` → **Settings → Secrets and variables →
   Actions → New repository secret**, name it `GSC_SERVICE_ACCOUNT_KEY`, and
   paste the base64 text.)
8. **Store the key in `.env.local`.** Copy the base64 text to the clipboard:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\<downloaded-file>.json")) | Set-Clipboard
   ```

   Then add one line to `curio-web/.env.local`:
   `GSC_SERVICE_ACCOUNT_KEY=` followed by a paste.

   Then clear the clipboard:

   ```powershell
   Set-Clipboard -Value $null
   ```

   (If Windows clipboard history (Win+V) is on, also delete the entry there.)
9. **Delete the downloaded `.json` file**, or move it into your password
   manager. The two stored copies are all you need.
10. **Check it works.** Run `npm run demand:report`. The log should say
    `Search Console: N page rows, …` rather than `skipped`. Search Console
    can take a few minutes to recognise a newly added user. If it says
    `PERMISSION_DENIED`, wait a little and try again, then re-check step 6.

    The full run makes about 1,150 Wiktionary requests and takes about 5
    minutes before the Search Console line appears, so it hasn't hung.

### Rotating the service account key

1. In the service account's **Keys** tab, create a new JSON key (step 4).
2. Repeat steps 7 and 8 with the new file. `gh secret set` overwrites the
   old secret.
3. Run `npm run demand:report` locally and confirm Search Console is
   included.
4. Back in the **Keys** tab, delete the **old** key (check the key ID and
   creation date).
5. Delete the downloaded file.

## Part B: the private `curio-reports` repo

The workflow publishes to a separate **private** repo. Nothing is ever
committed to `curio-web` (every push to its `master` deploys to
production, and `curio-web` is public).

1. **Create the repo.** Go to <https://github.com/new>:
   - Owner `SamxJames`, name `curio-reports`, **Private**.
   - Tick **Add a README file**. The workflow needs a `main` branch to
     check out.
   - Click **Create repository**.
2. **Create a fine-grained token.** Go to
   <https://github.com/settings/personal-access-tokens/new>:
   - **Token name:** `curio-reports publisher`
   - **Expiration:** 1 year. Put a reminder in your calendar a week before.
   - **Resource owner:** `SamxJames`
   - **Repository access:** **Only select repositories** → `curio-reports`
   - **Permissions → Repository permissions → Contents:** **Read and
     write**. "Metadata: Read-only" is added automatically. Leave
     everything else at "No access".
   - Click **Generate token**, then copy it.
   - GitHub shows the token only once. Keep that page open until step 3 is done.
3. **Store it as a secret on `curio-web`.** Run:

   ```powershell
   gh secret set REPORTS_REPO_TOKEN --repo SamxJames/curio-web
   ```

   Paste the token at the prompt. It isn't echoed.
4. **Read the report** at
   <https://github.com/SamxJames/curio-reports/blob/main/latest.md>. Past
   weeks are in `snapshots/` and in the repo's history.

### Rotating `REPORTS_REPO_TOKEN`

Before it expires, either **regenerate** the same token (open it in
<https://github.com/settings/personal-access-tokens> and click
**Regenerate token**) or create a new one as in step 2. Then repeat step
3, and delete the old token if you made a new one. An expired token makes
the "Check out curio-reports" step fail, the run shows as failed in the repo's
**Actions** tab, and GitHub may email you depending on your notification settings.

### If reports stop appearing

GitHub turns off scheduled workflows in a public repo after 60 days with no
repository activity. If `latest.md` stops updating, open `curio-web` →
**Actions** → **Demand report** and click **Enable workflow**. You can also run
it by hand there (**Run workflow**) or with `gh workflow run demand-report.yml --repo SamxJames/curio-web`.
