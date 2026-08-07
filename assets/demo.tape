Output "/tmp/cockpit-demo/cockpit.gif"

Set Shell "bash"
Set FontSize 15
Set Width 1180
Set Height 540
Set Padding 14
Set Theme "Catppuccin Mocha"
Set TypingSpeed 38ms

# startup + one real turn, hidden: banners scroll off before recording starts
Hide
Type "cd /tmp/cockpit-demo && export PI_CODING_AGENT_DIR=/tmp/cockpit-demo/.piconfig PI_SKIP_VERSION_CHECK=1 && clear" Enter
Sleep 500ms
Type "pi" Enter
Sleep 16s
Type "Call tilldone: new-list 'Ship v2 API', then add ['audit auth middleware','add rate limiting','write integration tests'], then toggle id 1. Reply OK and nothing else."
Enter
Sleep 25s
Show

# 1. tool-counter footer: model, context, tokens, cost, git status, tool tally
Sleep 3500ms

# 2. task footer
Type "/cockpit footer tilldone" Enter
Sleep 4s

# 3. overlay toggles open and closed
Type "/tilldone" Enter
Sleep 4s
Type "/tilldone" Enter
Sleep 1500ms

# 4. settings UI
Type "/cockpit" Enter
Sleep 4s
Escape
Sleep 2s

Hide
Type "/quit" Enter
Sleep 1500ms
