import type { FilterValue, FilterCondition, FilterOperator } from '@repo/types';

/**
 * Pure (no node:fs) evaluation of a condition/loop FilterValue. Shared by the
 * workflow runner (condition nodes, loop while-conditions). The caller supplies a
 * `resolve` that turns a template string (e.g. "{{steps.<id>.output.status}}")
 * into a concrete string value; all comparisons are string/number based.
 */

export type TemplateResolver = (template: string) => string;

/** Operators that ignore the right-hand operand. */
const UNARY_OPERATORS: ReadonlySet<FilterOperator> = new Set<FilterOperator>([
	'isEmpty',
	'isNotEmpty',
	'isTrue',
	'isFalse',
	'exists',
	'notExists',
]);

export function isUnaryOperator(op: FilterOperator): boolean {
	return UNARY_OPERATORS.has(op);
}

/** Evaluate a full FilterValue (and/or over its conditions). Empty ⇒ true. */
export function evalFilter(filter: FilterValue, resolve: TemplateResolver): boolean {
	if (!filter.conditions.length) return true;
	const results = filter.conditions.map((c) => evalCondition(c, resolve));
	return filter.combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
}

function evalCondition(condition: FilterCondition, resolve: TemplateResolver): boolean {
	const left = resolve(condition.left ?? '');
	const right = condition.right !== undefined ? resolve(condition.right) : '';
	return applyOperator(condition.operator, left, right);
}

function toNumber(value: string): number {
	const n = Number(value);
	return Number.isNaN(n) ? 0 : n;
}

function isPresent(value: string): boolean {
	const v = value.trim();
	return v !== '' && v !== 'undefined' && v !== 'null';
}

function applyOperator(op: FilterOperator, left: string, right: string): boolean {
	switch (op) {
		case 'equals':
			return left === right;
		case 'notEquals':
			return left !== right;
		case 'contains':
			return left.includes(right);
		case 'notContains':
			return !left.includes(right);
		case 'gt':
			return toNumber(left) > toNumber(right);
		case 'gte':
			return toNumber(left) >= toNumber(right);
		case 'lt':
			return toNumber(left) < toNumber(right);
		case 'lte':
			return toNumber(left) <= toNumber(right);
		case 'isEmpty':
			return left.trim() === '';
		case 'isNotEmpty':
			return left.trim() !== '';
		case 'isTrue':
			return left === 'true' || left === '1';
		case 'isFalse':
			return left === 'false' || left === '0' || left.trim() === '';
		case 'exists':
			return isPresent(left);
		case 'notExists':
			return !isPresent(left);
		default:
			return false;
	}
}
