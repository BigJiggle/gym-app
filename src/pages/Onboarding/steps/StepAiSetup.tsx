interface Props {
  apiKey: string
  setApiKey: (v: string) => void
}

export default function StepAiSetup({ apiKey, setApiKey }: Props) {
  const hasKey = apiKey.trim().length > 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">AI Setup</h2>
        <p className="text-sm text-gray-400 mt-1">
          Optional — add a Claude API key to generate a plan tailored to your profile.
          Leave it blank to use PrepCoach's built-in rule-based plans.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasKey ? 'bg-green-500' : 'bg-gray-600'}`} />
        <span className="text-xs text-gray-500">
          {hasKey ? 'AI-tailored plan generation' : 'Rule-based plan generation'}
        </span>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-brand-400 hover:text-brand-300 select-none">
          How to get a Claude API key ›
        </summary>
        <ol className="mt-2 space-y-1 list-decimal list-inside text-gray-400">
          <li>
            Go to{' '}
            <button
              type="button"
              onClick={() => window.api.openExternal('https://console.anthropic.com')}
              className="text-brand-400 hover:text-brand-300 underline"
            >
              console.anthropic.com
            </button>
          </li>
          <li>Create an account or sign in</li>
          <li>Navigate to <strong>API Keys</strong> → <strong>Create Key</strong></li>
          <li>Copy the key starting with <code className="bg-gray-800 px-1 rounded font-mono">sk-ant-...</code></li>
          <li>Paste it below</li>
        </ol>
        <p className="mt-2 text-gray-600">Key is stored locally and only sent to Anthropic's API. You can add or change it later in Settings.</p>
      </details>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Claude API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-... (optional)"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 font-mono"
        />
      </div>
    </div>
  )
}
