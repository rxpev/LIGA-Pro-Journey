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
import { FaInfoCircle, FaUpload } from 'react-icons/fa';
import worldMap from '@liga/frontend/assets/career-world-map.png';
import europeWorldMap from '@liga/frontend/assets/career-world-map-europe.png';
import americasWorldMap from '@liga/frontend/assets/career-world-map-americas.png';
import asiaWorldMap from '@liga/frontend/assets/career-world-map-asia.png';
import oceaniaWorldMap from '@liga/frontend/assets/career-world-map-oceania.png';

/**
 * Defines the form's default values.
 *
 * @constant
 */
const formDefaultValues: AppState['windowData'][Constants.WindowIdentifier.Landing]['user'] = {
  name: '',
  age: 18,
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

const highlightedWorldMaps: Record<string, string> = {
  Europe: europeWorldMap,
  'North America': americasWorldMap,
  'South America': americasWorldMap,
  Asia: asiaWorldMap,
  Oceania: oceaniaWorldMap,
};

const regionDetails: Record<string, { name: string; description: string }> = {
  Europe: {
    name: 'Europe',
    description: 'Many international tournament spots, elite competition',
  },
  'North America': {
    name: 'Americas',
    description: 'Moderate international tournament spots, tough competition',
  },
  'South America': {
    name: 'Americas',
    description: 'Moderate international tournament spots, tough competition',
  },
  Asia: {
    name: 'Asia',
    description: 'Few international tournament spots, moderate competition',
  },
  Oceania: {
    name: 'Oceania',
    description: 'Very few international tournament spots, weaker competition',
  },
};

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const { state, dispatch } = React.useContext(AppStateContext);
  const windowData = state.windowData.landing;
  const [avatar, setAvatar] = React.useState(
    () => windowData?.user?.avatar || 'resources://avatars/empty.png',
  );
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTranslation('windows');
  const audioClick = useAudio('button-click.wav');
  const audioRelease = useAudio('button-release.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const [simulateNpcMatchStats, setSimulateNpcMatchStats] = React.useState(
    windowData?.statistics?.simulateNpcMatchStats ?? true,
  );

  // form setup
  const { control, formState, handleSubmit, register, watch } = useForm({
    defaultValues: windowData?.user
      ? { ...formDefaultValues, ...windowData.user }
      : formDefaultValues,
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
  const selectedCountry = findCountryOptionByValue(countrySelectorData, watch('countryId'));
  const selectedContinent = countrySelectorData.find((continent) =>
    continent.options.some((country) => country.id === selectedCountry?.id),
  )?.label;
  const displayedWorldMap = selectedContinent
    ? highlightedWorldMaps[selectedContinent] || worldMap
    : worldMap;
  const selectedRegion = selectedContinent ? regionDetails[selectedContinent] : undefined;

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
        statistics: { simulateNpcMatchStats },
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

  const updateStatisticSimulation = (enabled: boolean) => {
    (enabled ? audioClick : audioRelease)();
    setSimulateNpcMatchStats(enabled);
    dispatch(
      windowDataUpdate({
        [Constants.WindowIdentifier.Landing]: {
          ...windowData,
          statistics: { simulateNpcMatchStats: enabled },
        },
      }),
    );
  };
  const canContinue =
    formState.isValid &&
    !formState.isSubmitting &&
    !(!formState.isDirty && formState.defaultValues === formDefaultValues);

  const handleNextStep = () => {
    if (!canContinue) {
      audioNegativeAlert();
      return;
    }

    handleSubmit(onSubmit)();
  };

  return (
    <div className="landing-create-user-step">
      <section className="landing-create-user-step__identity">
        <header>
          <span>Player Info</span>
        </header>
        <div className="landing-create-user-step__details">
          <section className="landing-create-user-step__avatar">
            <article>
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
                  .then(
                    (dialogData) => !dialogData.canceled && api.app.upload(dialogData.filePaths[0]),
                  )
                  .then((file) => !!file && setAvatar('uploads://' + file))
              }
            >
              <FaUpload />
            </button>
          </section>
          <form className="landing-create-user-step__form stack-y">
            <div className="landing-create-user-step__identity-fields">
              <section className="fieldset w-full">
                <label className="label">
                  <span className="label-text text-lg font-semibold">{t('shared.alias')}</span>
                </label>
                <input
                  {...register('name', { required: true, pattern: /^[\w]+$/, maxLength: 15 })}
                  type="text"
                  className={cx('input', 'w-full', !!formState.errors?.name?.type && 'input-error')}
                  placeholder="Enter your alias..."
                />
                <footer className="label h-5">
                  <span className="label-text-alt">
                    {formState.errors?.name?.type === 'required' && t('shared.required')}
                    {formState.errors?.name?.type === 'pattern' &&
                      t('shared.specialCharactersError')}
                  </span>
                </footer>
              </section>
              <section className="landing-create-user-step__age-field fieldset w-full">
                <label className="label">
                  <span className="label-text text-lg font-semibold">
                    Age{' '}
                    <span
                      className="tooltip tooltip-top ml-1"
                      data-tip="Age is purely cosmetic and does not affect gameplay."
                    >
                      <FaInfoCircle aria-label="Age is purely cosmetic" className="text-sm" />
                    </span>
                  </span>
                </label>
                <input
                  {...register('age', {
                    required: true,
                    valueAsNumber: true,
                    min: 14,
                    max: 60,
                    validate: (age) => Number.isInteger(age),
                  })}
                  type="number"
                  min="14"
                  max="60"
                  step="1"
                  className={cx('input', 'w-full', !!formState.errors?.age?.type && 'input-error')}
                  aria-label="Age"
                />
                <footer className="label h-5">
                  <span className="label-text-alt">
                    {(formState.errors?.age?.type === 'required' ||
                      formState.errors?.age?.type === 'typeError') &&
                      t('shared.required')}
                    {(formState.errors?.age?.type === 'min' ||
                      formState.errors?.age?.type === 'max' ||
                      formState.errors?.age?.type === 'validate') &&
                      '14–60 only.'}
                  </span>
                </footer>
              </section>
            </div>
            <section className="fieldset w-full">
              <label className="label">
                <span className="label-text text-lg font-semibold">{t('shared.country')}</span>
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
                    square
                    backgroundColor="#0b0f12"
                    borderColor="#59636a"
                  />
                )}
              />
              <footer className="label h-5">
                <span className="label-text-alt">{formState.errors?.countryId?.message}</span>
              </footer>
            </section>
          </form>
        </div>
        <section className="landing-create-user-step__statistics">
          <div>
            <span>Statistic Simulation (Recommended)</span>
            <p>Generate match statistics and news articles for simulated games in this save.</p>
          </div>
          <input
            type="checkbox"
            className="toggle"
            checked={simulateNpcMatchStats}
            onChange={(event) => updateStatisticSimulation(event.target.checked)}
          />
        </section>
      </section>
      <aside className="landing-create-user-step__region">
        <header>
          <span>Starting Region Preview</span>
          <p>
            Your selected country determines your starting region, which influences your initial
            teams, leagues, and opportunities.
          </p>
        </header>
        <div className="landing-create-user-step__region-content">
          <div
            className={cx(
              'landing-create-user-step__map',
              selectedContinent &&
                highlightedWorldMaps[selectedContinent] &&
                'landing-create-user-step__map--highlighted',
            )}
          >
            <img src={displayedWorldMap} alt="World region preview" />
          </div>
          <article className="landing-create-user-step__region-card">
            <span>{selectedRegion?.name || 'Select a country'}</span>
            <p>
              {selectedRegion?.description || 'Choose a country to preview your starting region.'}
            </p>
          </article>
        </div>
      </aside>
      <footer className="landing-create-user-step__actions">
        <button
          type="button"
          className="btn"
          onMouseDown={audioRelease}
          onClick={() => navigate('/')}
        >
          Cancel
        </button>
        <button
          type="button"
          className={cx('btn btn-primary', !canContinue && 'cursor-not-allowed opacity-50')}
          aria-disabled={!canContinue}
          onClick={handleNextStep}
          onMouseDown={() => canContinue && audioClick()}
        >
          {!!formState.isSubmitting && <span className="loading loading-spinner"></span>}
          Next Step <span>›</span>
        </button>
      </footer>
    </div>
  );
}
