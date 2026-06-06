/**
 * Team blazon image.
 *
 * @module
 */
import React from 'react';
import { cx } from '@liga/frontend/lib';
import Image from './image';

/** @interface */
interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  blur?: 'blur-xs' | 'blur-sm' | 'blur-md' | 'blur-lg' | 'blur-xl' | 'blur-2xl' | 'blur-3xl';
}

/**
 * Exports this module.
 *
 * @param props Root props.
 * @function
 * @exports
 */
export default function (props: Props) {
  const { className, blur, ...rest } = props;

  return (
    <Image
      {...rest}
      blur={blur}
      className={cx('shrink-0 object-contain object-center', className)}
    />
  );
}
