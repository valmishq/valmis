<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	/**
	 * CronSchedulePicker — visual schedule builder that stays in sync with a raw cron expression.
	 *
	 * Supported frequency modes:
	 *   every-minute    → * * * * *
	 *   every-n-minutes → *\/N * * * *           (configurable interval 1–59)
	 *   every-hour      → M * * * *              (configurable minute)
	 *   every-n-hours   → 0 *\/N * * *            (configurable interval 1–23)
	 *   every-day       → M H * * *              (configurable hour + minute)
	 *   specific-days   → M H * * D[,D…]        (chosen weekdays + hour + minute)
	 *   every-month     → M H dom * *            (configurable dom + hour + minute)
	 *   custom          → raw expression only
	 *
	 * Cursor-jump fix: numeric inputs use only bind:value — a single $effect owns
	 * rebuilding so Svelte never double-renders mid-keystroke.
	 */

	type Frequency =
		| 'every-minute'
		| 'every-n-minutes'
		| 'every-hour'
		| 'every-n-hours'
		| 'every-day'
		| 'specific-days'
		| 'every-month'
		| 'custom';

	interface Props {
		value: string;
	}

	let { value = $bindable() }: Props = $props();

	// ── Internal picker state ────────────────────────────────────────────────
	let frequency = $state<Frequency>('custom');
	let minute = $state(0); // 0–59
	let hour = $state(9); // 0–23
	/** Selected weekday numbers (1=Mon … 7=Sun). Used by specific-days mode. */
	let selectedDays = $state<Set<number>>(new Set([1, 2, 3, 4, 5])); // default Mon–Fri
	let monthDay = $state(1); // 1–28
	let minuteInterval = $state(15); // for every-n-minutes: 1–59
	let hourInterval = $state(2); // for every-n-hours:   1–23

	// ── Bootstrap: parse the initial value once ──────────────────────────────
	let _bootstrapped = false;
	$effect(() => {
		if (!_bootstrapped) {
			_bootstrapped = true;
			parseExpression(value);
		}
	});

	/**
	 * Parse a cron expression and update picker sub-state.
	 * Called only when the external value changes (not from our own build).
	 */
	function parseExpression(expr: string) {
		const parts = expr.trim().split(/\s+/);
		if (parts.length !== 5) {
			frequency = 'custom';
			return;
		}
		const [m, h, dom, mon, dow] = parts;

		// * * * * *
		if (expr.trim() === '* * * * *') {
			frequency = 'every-minute';
			return;
		}
		// */N * * * *  — every N minutes
		const everyNMinMatch = m.match(/^\*\/(\d+)$/);
		if (everyNMinMatch && h === '*' && dom === '*' && mon === '*' && dow === '*') {
			frequency = 'every-n-minutes';
			minuteInterval = clamp(parseInt(everyNMinMatch[1], 10), 1, 59);
			return;
		}
		// 0 */N * * *  — every N hours
		const everyNHrMatch = h.match(/^\*\/(\d+)$/);
		if (everyNHrMatch && dom === '*' && mon === '*' && dow === '*') {
			frequency = 'every-n-hours';
			hourInterval = clamp(parseInt(everyNHrMatch[1], 10), 1, 23);
			return;
		}
		// <m> * * * *  — every hour at a specific minute
		if (h === '*' && dom === '*' && mon === '*' && dow === '*') {
			frequency = 'every-hour';
			minute = clamp(parseInt(m, 10), 0, 59);
			return;
		}
		// <m> <h> * * <dow-list>  — specific weekdays (comma-sep or single digit or "1-5")
		// Guard: m and h must be plain integers (not */N or *) to be representable by the picker.
		if (
			dom === '*' &&
			mon === '*' &&
			dow !== '*' &&
			/^[\d,\-]+$/.test(dow) &&
			/^\d+$/.test(m) &&
			/^\d+$/.test(h)
		) {
			const days = parseDowList(dow);
			if (days.size > 0) {
				frequency = 'specific-days';
				minute = clamp(parseInt(m, 10), 0, 59);
				hour = clamp(parseInt(h, 10), 0, 23);
				selectedDays = days;
				return;
			}
		}
		// <m> <h> <dom> * *  — every month on a specific day
		if (dom !== '*' && mon === '*' && dow === '*' && /^\d+$/.test(dom)) {
			frequency = 'every-month';
			minute = clamp(parseInt(m, 10), 0, 59);
			hour = clamp(parseInt(h, 10), 0, 23);
			monthDay = clamp(parseInt(dom, 10), 1, 28);
			return;
		}
		// <m> <h> * * *  — every day
		if (dom === '*' && mon === '*' && dow === '*') {
			frequency = 'every-day';
			minute = clamp(parseInt(m, 10), 0, 59);
			hour = clamp(parseInt(h, 10), 0, 23);
			return;
		}
		frequency = 'custom';
	}

	/**
	 * Parse a dow string like "1,3,5" or "1-5" into a Set<number>.
	 * Handles comma-separated values and simple ranges.
	 */
	function parseDowList(dow: string): Set<number> {
		const result = new Set<number>();
		for (const part of dow.split(',')) {
			const rangeMatch = part.match(/^(\d)-(\d)$/);
			if (rangeMatch) {
				const from = parseInt(rangeMatch[1], 10);
				const to = parseInt(rangeMatch[2], 10);
				for (let d = from; d <= to; d++) {
					// Normalise: 0 (Sunday in standard cron) → 7 (our Sunday)
					const normalised = d === 0 ? 7 : d;
					if (normalised >= 1 && normalised <= 7) result.add(normalised);
				}
			} else {
				const n = parseInt(part, 10);
				if (!isNaN(n)) {
					// Normalise: 0 → 7
					const normalised = n === 0 ? 7 : n;
					if (normalised >= 1 && normalised <= 7) result.add(normalised);
				}
			}
		}
		return result;
	}

	/**
	 * Serialise a Set of weekday numbers to a compact dow string.
	 * If all 7 days selected → "*", Mon–Fri → "1-5", otherwise comma-separated sorted.
	 */
	function serialiseDow(days: Set<number>): string {
		if (days.size === 0) return '*';
		const sorted = [...days].sort((a, b) => a - b);
		if (sorted.length === 7) return '*';
		// Check for exact Mon-Fri
		if (sorted.join(',') === '1,2,3,4,5') return '1-5';
		return sorted.join(',');
	}

	/**
	 * Build the cron expression from current picker state.
	 * Returns unpadded integers — standard cron notation.
	 */
	function buildExpression(): string {
		const m = clamp(minute, 0, 59);
		const h = clamp(hour, 0, 23);
		switch (frequency) {
			case 'every-minute':
				return '* * * * *';
			case 'every-n-minutes':
				return `*/${clamp(minuteInterval, 1, 59)} * * * *`;
			case 'every-hour':
				return `${m} * * * *`;
			case 'every-n-hours':
				return `0 */${clamp(hourInterval, 1, 23)} * * *`;
			case 'every-day':
				return `${m} ${h} * * *`;
			case 'specific-days': {
				const dow = serialiseDow(selectedDays);
				// If all days selected, treat as every-day
				return `${m} ${h} * * ${dow === '*' ? '*' : dow}`;
			}
			case 'every-month':
				return `${m} ${h} ${monthDay} * *`;
			default:
				return value; // custom — don't overwrite
		}
	}

	// Tracks the last expression we wrote so we don't re-parse our own output
	let _lastEmitted = '';

	// Whenever picker sub-state changes, rebuild and emit (non-custom modes only)
	$effect(() => {
		const _f = frequency;
		const _m = minute;
		const _h = hour;
		// Spread to track set membership changes
		const _sd = [...selectedDays].join(',');
		const _d = monthDay;
		const _mi = minuteInterval;
		const _hi = hourInterval;

		if (_f === 'custom') return;

		const expr = buildExpression();
		if (expr !== _lastEmitted) {
			_lastEmitted = expr;
			value = expr;
		}
	});

	// When the external value changes (user typed in raw input), re-parse
	$effect(() => {
		const v = value;
		if (v !== _lastEmitted) {
			parseExpression(v);
		}
	});

	// ── Toggle a weekday in specific-days mode ────────────────────────────────
	function toggleDay(day: number) {
		const next = new Set(selectedDays);
		if (next.has(day)) {
			if (next.size > 1) next.delete(day); // always keep at least one
		} else {
			next.add(day);
		}
		selectedDays = next;
	}

	// ── Human-readable summary ────────────────────────────────────────────────
	const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const WEEKDAY_FULL = [
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday',
		'Sunday'
	];

	const summary = $derived.by(() => {
		const t = `${clamp(hour, 0, 23)}:${String(clamp(minute, 0, 59)).padStart(2, '0')}`;
		switch (frequency) {
			case 'every-minute':
				return 'Every minute';
			case 'every-n-minutes':
				return `Every ${clamp(minuteInterval, 1, 59)} minute${minuteInterval === 1 ? '' : 's'}`;
			case 'every-hour':
				return `Every hour at minute :${String(clamp(minute, 0, 59)).padStart(2, '0')}`;
			case 'every-n-hours':
				return `Every ${clamp(hourInterval, 1, 23)} hour${hourInterval === 1 ? '' : 's'}`;
			case 'every-day':
				return `Every day at ${t}`;
			case 'specific-days': {
				const sorted = [...selectedDays].sort((a, b) => a - b);
				const dayNames =
					sorted.length === 7
						? 'every day'
						: sorted.map((d) => WEEKDAY_FULL[d - 1] ?? '').join(', ');
				return `${dayNames} at ${t}`;
			}
			case 'every-month':
				return `Every month on day ${monthDay} at ${t}`;
			case 'custom':
				return 'Custom schedule';
		}
	});

	// ── Next-runs calculator ──────────────────────────────────────────────────

	/**
	 * Returns the next N fire times for a cron expression, starting from `now`.
	 * Iterates minute-by-minute — accurate for any standard 5-field cron expression.
	 * Returns an empty array if the expression is invalid or un-parseable.
	 */
	function nextRuns(expr: string, count: number = 3): Date[] {
		const parts = expr.trim().split(/\s+/);
		if (parts.length !== 5) return [];

		// Parse each field. WILDCARD = null (match all). INVALID = false.
		const minuteSet = parseField(parts[0], 0, 59);
		const hourSet = parseField(parts[1], 0, 23);
		const domSet = parseField(parts[2], 1, 31);
		const monthSet = parseField(parts[3], 1, 12);
		const dowSet = parseField(parts[4], 0, 7); // 0 and 7 both = Sunday

		// false means parse error — bail out
		if (
			minuteSet === false ||
			hourSet === false ||
			domSet === false ||
			monthSet === false ||
			dowSet === false
		)
			return [];

		const results: Date[] = [];
		// Start from the next whole minute
		const start = new Date();
		start.setSeconds(0, 0);
		start.setMinutes(start.getMinutes() + 1);

		const d = new Date(start);
		// Safety cap: search at most 400 000 minutes (~9 months) to prevent infinite loops
		const MAX_ITERS = 400_000;

		for (let i = 0; i < MAX_ITERS && results.length < count; i++) {
			const mm = d.getMinutes();
			const hh = d.getHours();
			const dom = d.getDate();
			const mon = d.getMonth() + 1; // 1-based
			const dow = d.getDay(); // 0=Sun, 1=Mon … 6=Sat

			// null = wildcard; also normalise sunday (0 and 7 are both valid)
			const dowMatches = dowSet === null || dowSet.has(dow) || (dow === 0 && dowSet.has(7));

			if (
				(monthSet === null || monthSet.has(mon)) &&
				(domSet === null || domSet.has(dom)) &&
				dowMatches &&
				(hourSet === null || hourSet.has(hh)) &&
				(minuteSet === null || minuteSet.has(mm))
			) {
				results.push(new Date(d));
			}

			d.setMinutes(d.getMinutes() + 1);
		}

		return results;
	}

	/**
	 * Parse a single cron field into a Set<number> of allowed values.
	 * Returns null  → wildcard ("*"), match everything.
	 * Returns false → parse error, expression is invalid.
	 *
	 * Supported syntax: `*`, `N`, `*\/N`, `N-M`, `N,M,...`
	 */
	function parseField(field: string, min: number, max: number): Set<number> | null | false {
		if (field === '*') return null; // wildcard

		const set = new Set<number>();

		for (const part of field.split(',')) {
			// */N — step
			const stepMatch = part.match(/^\*\/(\d+)$/);
			if (stepMatch) {
				const step = parseInt(stepMatch[1], 10);
				if (step < 1) return false;
				for (let v = min; v <= max; v += step) set.add(v);
				continue;
			}
			// N-M — range
			const rangeMatch = part.match(/^(\d+)-(\d+)$/);
			if (rangeMatch) {
				const from = parseInt(rangeMatch[1], 10);
				const to = parseInt(rangeMatch[2], 10);
				if (from > to) return false;
				for (let v = from; v <= to; v++) set.add(v);
				continue;
			}
			// Plain number
			if (/^\d+$/.test(part)) {
				set.add(parseInt(part, 10));
				continue;
			}
			// Unrecognised token — parse error
			return false;
		}

		return set.size > 0 ? set : false;
	}

	/** Format a Date as a short locale string without seconds. */
	function fmtDate(d: Date): string {
		return d.toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Reactively compute the next 3 runs whenever `value` changes.
	// Uses $derived so it re-runs on every expression change.
	const upcomingRuns = $derived(nextRuns(value, 3));

	// ── Helpers ───────────────────────────────────────────────────────────────
	function clamp(n: number, min: number, max: number): number {
		return isNaN(n) ? min : Math.min(Math.max(n, min), max);
	}

	// ── Option arrays ─────────────────────────────────────────────────────────
	const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
		{ value: 'every-minute', label: 'Every minute' },
		{ value: 'every-n-minutes', label: 'Every X minutes' },
		{ value: 'every-hour', label: 'Every hour' },
		{ value: 'every-n-hours', label: 'Every X hours' },
		{ value: 'every-day', label: 'Every day' },
		{ value: 'specific-days', label: 'On specific days' },
		{ value: 'every-month', label: 'Every month' },
		{ value: 'custom', label: 'Custom' }
	];

	const frequencyLabel = $derived(
		FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.label ?? 'Custom'
	);
</script>

<!-- CronSchedulePicker: visual schedule builder bound to a cron expression string -->
<div class="space-y-3">
	<Label>Runs</Label>

	<!-- ── Frequency selector + dependent fields ─────────────────────────────── -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Frequency -->
		<Select.Root
			type="single"
			value={frequency}
			onValueChange={(v) => {
				frequency = v as Frequency;
			}}
		>
			<Select.Trigger class="w-52">
				{frequencyLabel}
			</Select.Trigger>
			<Select.Content>
				{#each FREQUENCY_OPTIONS as opt (opt.value)}
					<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<!-- Every X minutes -->
		{#if frequency === 'every-n-minutes'}
			<span class="text-sm text-muted-foreground">every</span>
			<Input
				type="number"
				min={1}
				max={59}
				bind:value={minuteInterval}
				class="w-16 font-mono text-sm"
				aria-label="Interval in minutes (1–59)"
			/>
			<span class="text-sm text-muted-foreground">minute{minuteInterval === 1 ? '' : 's'}</span>
		{/if}

		<!-- Every hour at minute -->
		{#if frequency === 'every-hour'}
			<span class="text-sm text-muted-foreground">at minute</span>
			<Input
				type="number"
				min={0}
				max={59}
				bind:value={minute}
				class="w-16 font-mono text-sm"
				aria-label="Minute (0–59)"
			/>
		{/if}

		<!-- Every X hours -->
		{#if frequency === 'every-n-hours'}
			<span class="text-sm text-muted-foreground">every</span>
			<Input
				type="number"
				min={1}
				max={23}
				bind:value={hourInterval}
				class="w-16 font-mono text-sm"
				aria-label="Interval in hours (1–23)"
			/>
			<span class="text-sm text-muted-foreground">hour{hourInterval === 1 ? '' : 's'}</span>
		{/if}

		<!-- Every day: hour:minute -->
		{#if frequency === 'every-day'}
			<span class="text-sm text-muted-foreground">at</span>
			<Input
				type="number"
				min={0}
				max={23}
				bind:value={hour}
				class="w-16 font-mono text-sm"
				aria-label="Hour (0–23)"
			/>
			<span class="font-mono text-sm text-muted-foreground">:</span>
			<Input
				type="number"
				min={0}
				max={59}
				bind:value={minute}
				class="w-16 font-mono text-sm"
				aria-label="Minute (0–59)"
			/>
		{/if}

		<!-- Every month: day + hour:minute -->
		{#if frequency === 'every-month'}
			<span class="text-sm text-muted-foreground">on day</span>
			<Input
				type="number"
				min={1}
				max={28}
				bind:value={monthDay}
				class="w-16 font-mono text-sm"
				aria-label="Day of month (1–28)"
			/>
			<span class="text-sm text-muted-foreground">at</span>
			<Input
				type="number"
				min={0}
				max={23}
				bind:value={hour}
				class="w-16 font-mono text-sm"
				aria-label="Hour (0–23)"
			/>
			<span class="font-mono text-sm text-muted-foreground">:</span>
			<Input
				type="number"
				min={0}
				max={59}
				bind:value={minute}
				class="w-16 font-mono text-sm"
				aria-label="Minute (0–59)"
			/>
		{/if}
	</div>

	<!-- Specific days: day-of-week toggles + hour:minute on a second row -->
	{#if frequency === 'specific-days'}
		<div class="space-y-2">
			<!-- Day-of-week toggle buttons -->
			<div class="flex flex-wrap gap-1.5">
				{#each WEEKDAY_SHORT as label, i (i)}
					{@const day = i + 1}
					{@const active = selectedDays.has(day)}
					<button
						type="button"
						onclick={() => toggleDay(day)}
						class="flex h-8 w-10 items-center justify-center rounded-md border text-xs font-medium transition-colors
							{active
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-background text-muted-foreground hover:bg-muted'}"
						aria-pressed={active}
						aria-label={WEEKDAY_FULL[i]}
					>
						{label}
					</button>
				{/each}
			</div>
			<!-- Time row -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-sm text-muted-foreground">at</span>
				<Input
					type="number"
					min={0}
					max={23}
					bind:value={hour}
					class="w-16 font-mono text-sm"
					aria-label="Hour (0–23)"
				/>
				<span class="font-mono text-sm text-muted-foreground">:</span>
				<Input
					type="number"
					min={0}
					max={59}
					bind:value={minute}
					class="w-16 font-mono text-sm"
					aria-label="Minute (0–59)"
				/>
			</div>
		</div>
	{/if}

	<!-- ── Human-readable summary ─────────────────────────────────────────────── -->
	{#if frequency !== 'custom'}
		<p class="text-xs text-muted-foreground">
			<span class="font-medium text-foreground">{summary}</span>
		</p>
	{/if}

	<!-- ── Next 3 runs ───────────────────────────────────────────────────────── -->
	{#if upcomingRuns.length > 0}
		<div class="rounded-md bg-muted/50 px-3 py-2.5">
			<p class="mb-1.5 text-xs font-medium text-muted-foreground">Next 3 runs</p>
			<ol class="space-y-1">
				{#each upcomingRuns as run, i (i)}
					<li class="flex items-center gap-2 text-xs text-foreground">
						<span
							class="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
						>
							{i + 1}
						</span>
						<span class="font-mono">{fmtDate(run)}</span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}
</div>
