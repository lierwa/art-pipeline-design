declare module "@yaireo/tagify/react" {
  import type { ComponentType } from "react";

  type TagifyValue = {
    value: string;
  };

  type TagifySettings = {
    delimiters?: string;
    duplicates?: boolean;
    trim?: boolean;
    editTags?: boolean;
    dropdown?: {
      enabled?: boolean;
    };
    a11y?: {
      inputAriaLabel?: string;
    };
  };

  type TagifyChangeEvent = CustomEvent<{
    value: string;
  }>;

  type TagsProps = {
    className?: string;
    placeholder?: string;
    readOnly?: boolean;
    settings?: TagifySettings;
    value?: TagifyValue[];
    onChange?: (event: TagifyChangeEvent) => void;
  };

  // WHY: Tagify 的 React wrapper 当前没有随包暴露 TS 类型；这里只声明本适配器使用的最小边界，避免把 unknown/any 泄漏进业务组件。
  const Tags: ComponentType<TagsProps>;

  export default Tags;
}
