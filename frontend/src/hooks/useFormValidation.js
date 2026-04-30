import { useState, useCallback } from 'react';
import { useErrorToast } from './useErrorToast';

/**
 * 统一表单校验 hook
 *
 * @param {object} rules - 校验规则
 * @param {string} rules.fieldName.required - 必填提示文字
 * @param {Function} rules.fieldName.validator - 自定义校验函数
 *
 * @example
 * const { validate, errors } = useFormValidation({
 *   clientId: { required: '请选择客户' },
 *   girlId: { required: '请选择女生' },
 *   dateTime: { required: '请选择约会时间' },
 * });
 */
export function useFormValidation(rules) {
  const [errors, setErrors] = useState({});
  const { showWarning } = useErrorToast();

  const validate = useCallback((data) => {
    const newErrors = {};
    let isValid = true;

    for (const [field, rule] of Object.entries(rules)) {
      const value = data?.[field];

      // 必填校验
      if (rule.required) {
        if (value === undefined || value === null || value === '') {
          newErrors[field] = rule.required;
          isValid = false;
        }
      }

      // 自定义校验
      if (rule.validator && value !== undefined && value !== null && value !== '') {
        const customError = rule.validator(value, data);
        if (customError) {
          newErrors[field] = customError;
          isValid = false;
        }
      }
    }

    setErrors(newErrors);

    if (!isValid) {
      const firstError = Object.values(newErrors)[0];
      showWarning(firstError);
    }

    return isValid;
  }, [rules, showWarning]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  return { validate, errors, clearErrors };
}
