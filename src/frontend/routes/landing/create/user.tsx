/**
 * Collects user information when
 * user starts a new career.
 *
 * @module
 */
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { Constants } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { AppState } from '@liga/frontend/redux/state';
import { windowDataUpdate } from '@liga/frontend/redux/actions';
import { useAudio, useTranslation } from '@liga/frontend/hooks';
import { CountrySelect, findCountryOptionByValue } from '@liga/frontend/components/select';
import { FaUpload } from 'react-icons/fa';

/**
 * Defines the form's default values.
 *
 * @constant
 */
const formDefaultValues: AppState['windowData'][Constants.WindowIdentifier.Landing]['user'] = {
  name: '',
  countryId: undefined,
};

const countrySelectorContinentOrder: Record<string, number> = {
  EU: 0,
  NA: 1,
  SA: 2,
  AS: 3,
  OC: 4,
  AF: 5,
};

const countrySelectorExcludedRegionCodes = new Set(['eu', 'na', 'sa', 'as', 'xsa', 'other']);
const countrySelectorExcludedRegionNames = new Set([
  'Europe',
  'North America',
  'South America',
  'Asia',
  'Other',
]);

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const { state, dispatch } = React.useContext(AppStateContext);
  const [avatar, setAvatar] = React.useState('resources://avatars/empty.png');
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTranslation('windows');
  const audioClick = useAudio('button-click.wav');
  const windowData = state.windowData.landing;

  // form setup
  const { control, formState, handleSubmit, register } = useForm({
    defaultValues: windowData?.user ? windowData.user : formDefaultValues,
    mode: 'all',
  });

  // load country data
  const countrySelectorData = React.useMemo(() => {
    return [...state.continents]
      .sort(
        (left, right) =>
          (countrySelectorContinentOrder[left.code] ?? Number.MAX_SAFE_INTEGER) -
          (countrySelectorContinentOrder[right.code] ?? Number.MAX_SAFE_INTEGER),
      )
      .map((continent) => ({
        label: continent.name,
        options: continent.countries
          .filter(
            (country) =>
              !countrySelectorExcludedRegionCodes.has(country.code) &&
              !countrySelectorExcludedRegionNames.has(country.name),
          )
          .map((country) => ({
            ...country,
            value: country.id,
            label: country.name,
          })),
      }));
  }, [state.continents]);

  // assign avatar if none found in window data
  React.useEffect(() => {
    if (windowData?.user?.avatar) {
      return setAvatar(windowData?.user?.avatar);
    }
  }, [windowData]);

  // update window state everytime the blazon gets updated
  React.useEffect(() => {
    // save data to redux
    const data = {
      [Constants.WindowIdentifier.Landing]: {
        ...windowData,
        user: { ...windowData.user, avatar },
      },
    };
    dispatch(windowDataUpdate(data));
  }, [avatar]);

  // handle form submission
  const onSubmit = (user: typeof formDefaultValues) => {
    // save data to redux
    const data = {
      [Constants.WindowIdentifier.Landing]: {
        ...windowData,
        user: { ...user, avatar },
      },
    };
    dispatch(windowDataUpdate(data));

    // move to next step in form
    const [currentStep] = location.pathname
      .split('/')
      .slice(-1)
      .map((path) => parseInt(path) || 1);
    navigate('/create/' + (currentStep + 1));
  };

  return (
    <div className="stack-y">
      <section className="stack-y items-center gap-4!">
        <article className="center h-32 w-auto">
          <img src={avatar} className="h-32 w-auto" />
        </article>
        <button
          title="Upload Avatar"
          className="btn btn-square btn-primary"
          onMouseDown={audioClick}
          onClick={() =>
            api.app
              .dialog(Constants.WindowIdentifier.Landing, {
                properties: ['openFile'],
                filters: [{ name: 'Images', extensions: ['jpg', 'png', 'svg'] }],
              })
              .then((dialogData) => !dialogData.canceled && api.app.upload(dialogData.filePaths[0]))
              .then((file) => !!file && setAvatar('uploads://' + file))
          }
        >
          <FaUpload />
        </button>
      </section>
      <form className="stack-y">
        <section className="fieldset w-full">
          <label className="label">
            <span className="label-text text-lg font-semibold">{t('shared.alias')}</span>
          </label>
          <input
            {...register('name', { required: true, pattern: /^[\w]+$/, maxLength: 15 })}
            type="text"
            className={cx('input', 'w-full', !!formState.errors?.name?.type && 'input-error')}
          />
          <footer className="label h-5">
            <span className="label-text-alt">
              {formState.errors?.name?.type === 'required' && t('shared.required')}
              {formState.errors?.name?.type === 'pattern' && t('shared.specialCharactersError')}
            </span>
          </footer>
        </section>
        <section className="fieldset w-full">
          <label className="label">
            <span className="label-text text-lg font-semibold">{t('shared.country')}</span>
            <span className="label-text-alt ml-2 italic opacity-80">
              (This affects your starting region!)
            </span>
          </label>
          <Controller
            name="countryId"
            control={control}
            rules={{
              required: true,
              validate: (countryId) =>
                Boolean(findCountryOptionByValue(countrySelectorData, countryId)),
            }}
            render={({ field: { onChange, value } }) => (
              <CountrySelect
                value={findCountryOptionByValue(countrySelectorData, value) || null}
                options={countrySelectorData}
                onChange={(option) => onChange(option.value)}
              />
            )}
          />
          <footer className="label h-5">
            <span className="label-text-alt">{formState.errors?.countryId?.message}</span>
          </footer>
        </section>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          onClick={handleSubmit(onSubmit)}
          onMouseDown={audioClick}
          disabled={
            !formState.isValid ||
            formState.isSubmitting ||
            (!formState.isDirty && formState.defaultValues === formDefaultValues)
          }
        >
          {!!formState.isSubmitting && <span className="loading loading-spinner"></span>}
          {t('landing.create.next')}
        </button>
      </form>
    </div>
  );
}
