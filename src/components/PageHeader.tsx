/**
 * Page header (design spec §2.2). The kicker states source and basis for
 * single-source screens (part of I6 compliance), e.g.
 * `D1 · report 1421 · service date`.
 */
export function PageHeader(props: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const inner = (
    <div>
      {props.kicker ? <div className="page-kicker">{props.kicker}</div> : null}
      <h1 className="page-title">{props.title}</h1>
      {props.lede ? <p className="page-lede">{props.lede}</p> : null}
    </div>
  );
  if (props.right) {
    return (
      <div className="page-header page-header--flex">
        {inner}
        <div className="page-header-stat">{props.right}</div>
      </div>
    );
  }
  return <div className="page-header">{inner}</div>;
}
